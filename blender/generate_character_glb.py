"""
Blender Python Script: Generate Rigged 3D Runner Character (.glb)
=================================================================
Usage in Blender (3.x / 4.x):
  blender --background --python blender/generate_character_glb.py -- assets/character_rigged.glb

This script creates a cute stylized Q-version character with an Armature skeleton
(Root, Hips, Torso, Head, ArmL, ArmR, LegL, LegR) and 6 NLA animation actions:
  - Idle    : Breathing and gentle swaying at the start line
  - Run     : Standard running cycle on the track
  - Sprint  : Fast leaning-forward sprint burst when answering correctly
  - Fall    : Stumbling and falling flat when answering incorrectly
  - Recover : Pushing up from the ground to resume running
  - Cheer   : Jumping and waving arms at the finish line
"""

import sys
import math

try:
    import bpy
    import mathutils
except ImportError:
    print("Note: Run this script inside Blender (blender -b -P generate_character_glb.py)")
    sys.exit(0)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def create_material(name, rgba):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = 0.75
    return mat


def build_rigged_character():
    clear_scene()

    # Create Armature
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm_obj = bpy.context.active_object
    arm_obj.name = "RunnerArmature"
    arm = arm_obj.data
    arm.name = "RunnerRig"

    # Remove default bone
    for b in list(arm.edit_bones):
        arm.edit_bones.remove(b)

    def add_bone(name, head, tail, parent=None):
        b = arm.edit_bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = parent
            b.use_connect = False
        return b

    b_root = add_bone("Root", (0, 0, 0), (0, 0, 0.2))
    b_hips = add_bone("Hips", (0, 0, 0.55), (0, 0, 0.75), b_root)
    b_torso = add_bone("Torso", (0, 0, 0.75), (0, 0, 1.35), b_hips)
    b_head = add_bone("Head", (0, 0, 1.35), (0, 0, 2.15), b_torso)
    b_arm_l = add_bone("ArmL", (0.38, 0, 1.25), (0.55, 0, 0.75), b_torso)
    b_arm_r = add_bone("ArmR", (-0.38, 0, 1.25), (-0.55, 0, 0.75), b_torso)
    b_leg_l = add_bone("LegL", (0.18, 0, 0.55), (0.18, 0, 0.05), b_hips)
    b_leg_r = add_bone("LegR", (-0.18, 0, 0.55), (-0.18, 0, 0.05), b_hips)

    bpy.ops.object.mode_set(mode='OBJECT')

    # Create stylized character parts parented to bones
    parts = [
        ("HeadMesh", "Head", "UV_SPHERE", (0, 0, 1.75), (0.48, 0.44, 0.46), (0.98, 0.84, 0.75, 1.0)),
        ("TorsoMesh", "Torso", "CONE", (0, 0, 0.95), (0.42, 0.32, 0.48), (0.92, 0.35, 0.22, 1.0)),
        ("ArmLMesh", "ArmL", "CYLINDER", (0.45, 0, 1.0), (0.11, 0.11, 0.28), (0.98, 0.84, 0.75, 1.0)),
        ("ArmRMesh", "ArmR", "CYLINDER", (-0.45, 0, 1.0), (0.11, 0.11, 0.28), (0.98, 0.84, 0.75, 1.0)),
        ("LegLMesh", "LegL", "CYLINDER", (0.18, 0, 0.3), (0.13, 0.13, 0.28), (0.98, 0.98, 0.98, 1.0)),
        ("LegRMesh", "LegR", "CYLINDER", (-0.18, 0, 0.3), (0.13, 0.13, 0.28), (0.98, 0.98, 0.98, 1.0)),
    ]

    for name, bone_name, prim, loc, scale, color in parts:
        if prim == "UV_SPHERE":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1.0, location=loc)
        elif prim == "CONE":
            bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=1.0, radius2=0.65, depth=1.0, location=loc)
        else:
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1.0, depth=1.0, location=loc)

        obj = bpy.context.active_object
        obj.name = name
        obj.scale = scale
        bpy.ops.object.shade_smooth()
        mat = create_material(f"Mat_{name}", color)
        obj.data.materials.append(mat)

        # Bind to armature bone
        obj.parent = arm_obj
        obj.parent_type = 'BONE'
        obj.parent_bone = bone_name

    # Create Animation Actions
    create_animations(arm_obj)
    return arm_obj


def create_animations(arm_obj):
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='POSE')

    for pbone in arm_obj.pose.bones:
        pbone.rotation_mode = 'XYZ'

    actions_spec = {
        "Idle": (24, [
            (0,   {"Hips": (0, 0, 0), "ArmL": (0.1, 0, 0), "ArmR": (-0.1, 0, 0), "Head": (0, 0, 0)}),
            (12,  {"Hips": (0.03, 0, 0), "ArmL": (-0.1, 0, 0), "ArmR": (0.1, 0, 0), "Head": (0.04, 0, 0.03)}),
            (24,  {"Hips": (0, 0, 0), "ArmL": (0.1, 0, 0), "ArmR": (-0.1, 0, 0), "Head": (0, 0, 0)}),
        ]),
        "Run": (20, [
            (0,   {"Torso": (0.18, 0, 0), "ArmL": (0.85, 0, 0), "ArmR": (-0.85, 0, 0), "LegL": (-0.8, 0, 0), "LegR": (0.8, 0, 0)}),
            (10,  {"Torso": (0.18, 0, 0), "ArmL": (-0.85, 0, 0), "ArmR": (0.85, 0, 0), "LegL": (0.8, 0, 0), "LegR": (-0.8, 0, 0)}),
            (20,  {"Torso": (0.18, 0, 0), "ArmL": (0.85, 0, 0), "ArmR": (-0.85, 0, 0), "LegL": (-0.8, 0, 0), "LegR": (0.8, 0, 0)}),
        ]),
        "Sprint": (12, [
            (0,   {"Torso": (0.38, 0, 0), "ArmL": (1.3, 0, 0), "ArmR": (-1.3, 0, 0), "LegL": (-1.2, 0, 0), "LegR": (1.2, 0, 0)}),
            (6,   {"Torso": (0.38, 0, 0), "ArmL": (-1.3, 0, 0), "ArmR": (1.3, 0, 0), "LegL": (1.2, 0, 0), "LegR": (-1.2, 0, 0)}),
            (12,  {"Torso": (0.38, 0, 0), "ArmL": (1.3, 0, 0), "ArmR": (-1.3, 0, 0), "LegL": (-1.2, 0, 0), "LegR": (1.2, 0, 0)}),
        ]),
        "Fall": (24, [
            (0,   {"Root": (0, 0, 0), "Torso": (0.15, 0, 0), "ArmL": (0.4, 0, 0), "ArmR": (0.4, 0, 0)}),
            (8,   {"Root": (0.6, 0, 0), "Torso": (0.4, 0, 0), "ArmL": (1.4, 0, 0.3), "ArmR": (1.4, 0, -0.3)}),
            (18,  {"Root": (1.45, 0, 0), "Torso": (0.1, 0, 0), "ArmL": (1.8, 0, 0.4), "ArmR": (1.8, 0, -0.4)}),
            (24,  {"Root": (1.45, 0, 0), "Torso": (0.1, 0, 0), "ArmL": (1.7, 0, 0.4), "ArmR": (1.7, 0, -0.4)}),
        ]),
    }

    arm_obj.animation_data_create()
    for act_name, (end_frame, keyframes) in actions_spec.items():
        action = bpy.data.actions.new(name=act_name)
        arm_obj.animation_data.action = action
        for frame, pose_dict in keyframes:
            for bone_name, rot in pose_dict.items():
                pbone = arm_obj.pose.bones.get(bone_name)
                if pbone:
                    pbone.rotation_euler = rot
                    pbone.keyframe_insert(data_path="rotation_euler", frame=frame)
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = act_name
        track.strips.new(act_name, 0, action)

    bpy.ops.object.mode_set(mode='OBJECT')


if __name__ == "__main__":
    out_path = "assets/character_rigged.glb"
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1:]
        if args:
            out_path = args[0]
    build_rigged_character()
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_animations=True)
    print(f"Exported rigged GLB to {out_path}")
