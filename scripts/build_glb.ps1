# PowerShell GLTF 2.0 Binary (.glb) Generator for Rigged Character
# Generates assets/character_rigged.glb with hierarchical skeleton nodes & 6 animations:
# Idle, Run, Sprint, Fall, Recover, Cheer

$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectDir "assets"
$jsDir = Join-Path $projectDir "js"
if (!(Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }
if (!(Test-Path $jsDir)) { New-Item -ItemType Directory -Path $jsDir | Out-Null }

# Helper to convert Euler X,Y,Z (radians) to Quaternion [x, y, z, w]
function Get-Quat([double]$rx, [double]$ry, [double]$rz) {
    $cx = [Math]::Cos($rx * 0.5); $sx = [Math]::Sin($rx * 0.5)
    $cy = [Math]::Cos($ry * 0.5); $sy = [Math]::Sin($ry * 0.5)
    $cz = [Math]::Cos($rz * 0.5); $sz = [Math]::Sin($rz * 0.5)
    $qx = $sx * $cy * $cz - $cx * $sy * $sz
    $qy = $cx * $sy * $cz + $sx * $cy * $sz
    $qz = $cx * $cy * $sz - $sx * $sy * $cz
    $qw = $cx * $cy * $cz + $sx * $sy * $sz
    return @([float]$qx, [float]$qy, [float]$qz, [float]$qw)
}

# Binary buffer builder
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bufferViews = New-Object System.Collections.ArrayList
$accessors = New-Object System.Collections.ArrayList

function Align-Stream {
    while (($ms.Position % 4) -ne 0) {
        $bw.Write([byte]0)
    }
}

function Add-FloatArray([float[]]$values, [string]$type, [int]$compCount, [bool]$calcMinMax = $false, [int]$target = 0) {
    Align-Stream
    $byteOffset = [int]$ms.Position
    foreach ($v in $values) {
        $bw.Write([float]$v)
    }
    $byteLength = [int]$ms.Position - $byteOffset
    $bvIdx = $bufferViews.Count
    $bv = @{
        buffer = 0
        byteOffset = $byteOffset
        byteLength = $byteLength
    }
    if ($target -ne 0) { $bv.target = $target }
    [void]$bufferViews.Add($bv)

    $count = [int]($values.Length / $compCount)
    $acc = @{
        bufferView = $bvIdx
        byteOffset = 0
        componentType = 5126 # FLOAT
        count = $count
        type = $type
    }
    if ($calcMinMax) {
        $min = New-Object float[] $compCount
        $max = New-Object float[] $compCount
        for ($c = 0; $c -lt $compCount; $c++) {
            $min[$c] = [float]::PositiveInfinity
            $max[$c] = [float]::NegativeInfinity
        }
        for ($i = 0; $i -lt $count; $i++) {
            for ($c = 0; $c -lt $compCount; $c++) {
                $val = $values[$i * $compCount + $c]
                if ($val -lt $min[$c]) { $min[$c] = $val }
                if ($val -gt $max[$c]) { $max[$c] = $val }
            }
        }
        $acc.min = $min
        $acc.max = $max
    }
    $accIdx = $accessors.Count
    [void]$accessors.Add($acc)
    return $accIdx
}

function Add-UShortArray([uint16[]]$values) {
    Align-Stream
    $byteOffset = [int]$ms.Position
    foreach ($v in $values) {
        $bw.Write([uint16]$v)
    }
    $byteLength = [int]$ms.Position - $byteOffset
    $bvIdx = $bufferViews.Count
    [void]$bufferViews.Add(@{
        buffer = 0
        byteOffset = $byteOffset
        byteLength = $byteLength
        target = 34963 # ELEMENT_ARRAY_BUFFER
    })
    $accIdx = $accessors.Count
    [void]$accessors.Add(@{
        bufferView = $bvIdx
        byteOffset = 0
        componentType = 5123 # UNSIGNED_SHORT
        count = $values.Length
        type = "SCALAR"
    })
    return $accIdx
}

# Build UV Sphere mesh data (used for smooth organic character base mesh in GLB)
function Build-SphereMesh([float]$rx, [float]$ry, [float]$rz, [float]$oy) {
    $latBands = 16
    $lonBands = 20
    $pos = New-Object System.Collections.Generic.List[float]
    $norm = New-Object System.Collections.Generic.List[float]
    $uv = New-Object System.Collections.Generic.List[float]
    $idx = New-Object System.Collections.Generic.List[uint16]

    for ($lat = 0; $lat -le $latBands; $lat++) {
        $theta = $lat * [Math]::PI / $latBands
        $sinT = [Math]::Sin($theta)
        $cosT = [Math]::Cos($theta)
        $vCoord = [float](1.0 - ($lat / [double]$latBands))
        for ($lon = 0; $lon -le $lonBands; $lon++) {
            $phi = $lon * 2.0 * [Math]::PI / $lonBands
            $sinP = [Math]::Sin($phi)
            $cosP = [Math]::Cos($phi)
            $uCoord = [float]($lon / [double]$lonBands)
            # Orient u=0.5 directly toward +Z (front of character face)
            $nx = [float](-$sinP * $sinT)
            $ny = [float]$cosT
            $nz = [float](-$cosP * $sinT)
            $pos.Add($nx * $rx)
            $pos.Add($ny * $ry + $oy)
            $pos.Add($nz * $rz)
            $norm.Add($nx)
            $norm.Add($ny)
            $norm.Add($nz)
            $uv.Add($uCoord)
            $uv.Add($vCoord)
        }
    }
    for ($lat = 0; $lat -lt $latBands; $lat++) {
        for ($lon = 0; $lon -lt $lonBands; $lon++) {
            $first = [uint16]($lat * ($lonBands + 1) + $lon)
            $second = [uint16]($first + $lonBands + 1)
            $idx.Add($first)
            $idx.Add($second)
            $idx.Add([uint16]($first + 1))
            $idx.Add($second)
            $idx.Add([uint16]($second + 1))
            $idx.Add([uint16]($first + 1))
        }
    }
    $posAcc = Add-FloatArray $pos.ToArray() "VEC3" 3 $true 34962
    $normAcc = Add-FloatArray $norm.ToArray() "VEC3" 3 $false 34962
    $uvAcc = Add-FloatArray $uv.ToArray() "VEC2" 2 $false 34962
    $idxAcc = Add-UShortArray $idx.ToArray()
    return @{ pos = $posAcc; norm = $normAcc; uv = $uvAcc; idx = $idxAcc }
}

$headMeshData  = Build-SphereMesh 0.46 0.42 0.44 0.36
$torsoMeshData = Build-SphereMesh 0.34 0.40 0.28 0.32
$limbMeshData  = Build-SphereMesh 0.11 0.24 0.11 -0.20

# Node indices:
# 0..7: Bone Group Nodes (Root, Hips, Torso, Head, ArmL, ArmR, LegL, LegR)
# 8..13: Child Mesh Nodes (HeadMesh, TorsoMesh, ArmLMesh, ArmRMesh, LegLMesh, LegRMesh)

$nodes = @(
    @{ name = "Root";      translation = @(0.0, 0.0, 0.0);   rotation = @(0.0, 0.0, 0.0, 1.0); children = @(1) },
    @{ name = "Hips";      translation = @(0.0, 0.48, 0.0);  rotation = @(0.0, 0.0, 0.0, 1.0); children = @(2, 6, 7) },
    @{ name = "Torso";     translation = @(0.0, 0.05, 0.0);  rotation = @(0.0, 0.0, 0.0, 1.0); children = @(3, 4, 5, 9) },
    @{ name = "Head";      translation = @(0.0, 0.68, 0.0);  rotation = @(0.0, 0.0, 0.0, 1.0); children = @(8) },
    @{ name = "ArmL";      translation = @(0.36, 0.56, 0.0); rotation = @(0.0, 0.0, -0.18, 0.9836); children = @(10) },
    @{ name = "ArmR";      translation = @(-0.36, 0.56, 0.0);rotation = @(0.0, 0.0, 0.18, 0.9836);  children = @(11) },
    @{ name = "LegL";      translation = @(0.16, 0.0, 0.0);  rotation = @(0.0, 0.0, 0.0, 1.0); children = @(12) },
    @{ name = "LegR";      translation = @(-0.16, 0.0, 0.0); rotation = @(0.0, 0.0, 0.0, 1.0); children = @(13) },
    @{ name = "HeadMesh";  translation = @(0.0, 0.0, 0.0);   rotation = @(0.0, 0.0, 0.0, 1.0); mesh = 0 },
    @{ name = "TorsoMesh"; translation = @(0.0, 0.0, 0.0);   rotation = @(0.0, 0.0, 0.0, 1.0); mesh = 1 },
    @{ name = "ArmLMesh";  translation = @(0.0, 0.0, 0.0);   rotation = @(0.0, 0.0, 0.0, 1.0); mesh = 2 },
    @{ name = "ArmRMesh";  translation = @(0.0, 0.0, 0.0);   rotation = @(0.0, 0.0, 0.0, 1.0); mesh = 2 },
    @{ name = "LegLMesh";  translation = @(0.0, 0.0, 0.0);   rotation = @(0.0, 0.0, 0.0, 1.0); mesh = 3 },
    @{ name = "LegRMesh";  translation = @(0.0, 0.0, 0.0);   rotation = @(0.0, 0.0, 0.0, 1.0); mesh = 3 }
)

$materials = @(
    @{ name = "SkinMat";  pbrMetallicRoughness = @{ baseColorFactor = @(0.99, 0.86, 0.76, 1.0); metallicFactor = 0.0; roughnessFactor = 0.85 } },
    @{ name = "TopMat";   pbrMetallicRoughness = @{ baseColorFactor = @(0.93, 0.35, 0.21, 1.0); metallicFactor = 0.0; roughnessFactor = 0.80 } },
    @{ name = "PantsMat"; pbrMetallicRoughness = @{ baseColorFactor = @(0.20, 0.32, 0.52, 1.0); metallicFactor = 0.0; roughnessFactor = 0.80 } }
)

$meshes = @(
    @{ name = "HeadGeo";  primitives = @(@{ attributes = @{ POSITION = $headMeshData.pos;  NORMAL = $headMeshData.norm;  TEXCOORD_0 = $headMeshData.uv };  indices = $headMeshData.idx;  material = 0 }) },
    @{ name = "TorsoGeo"; primitives = @(@{ attributes = @{ POSITION = $torsoMeshData.pos; NORMAL = $torsoMeshData.norm; TEXCOORD_0 = $torsoMeshData.uv }; indices = $torsoMeshData.idx; material = 1 }) },
    @{ name = "ArmGeo";   primitives = @(@{ attributes = @{ POSITION = $limbMeshData.pos;  NORMAL = $limbMeshData.norm;  TEXCOORD_0 = $limbMeshData.uv };  indices = $limbMeshData.idx;  material = 0 }) },
    @{ name = "LegGeo";   primitives = @(@{ attributes = @{ POSITION = $limbMeshData.pos;  NORMAL = $limbMeshData.norm;  TEXCOORD_0 = $limbMeshData.uv };  indices = $limbMeshData.idx;  material = 2 }) }
)

# Helper to add an animation track
function Build-QuatAccessor([array]$quats) {
    $flat = New-Object System.Collections.Generic.List[float]
    foreach ($q in $quats) {
        $flat.Add([float]$q[0]); $flat.Add([float]$q[1]); $flat.Add([float]$q[2]); $flat.Add([float]$q[3])
    }
    return Add-FloatArray $flat.ToArray() "VEC4" 4 $false
}

function Build-Vec3Accessor([array]$vecs) {
    $flat = New-Object System.Collections.Generic.List[float]
    foreach ($v in $vecs) {
        $flat.Add([float]$v[0]); $flat.Add([float]$v[1]); $flat.Add([float]$v[2])
    }
    return Add-FloatArray $flat.ToArray() "VEC3" 3 $false
}

$animations = New-Object System.Collections.ArrayList

# 1. Idle Animation (1.2s loop)
$tIdle = Add-FloatArray @(0.0, 0.6, 1.2) "SCALAR" 1 $true
$hipsPosIdle = Build-Vec3Accessor @( @(0.0, 0.48, 0.0), @(0.0, 0.51, 0.0), @(0.0, 0.48, 0.0) )
$headRotIdle = Build-QuatAccessor @( (Get-Quat 0 0 -0.04), (Get-Quat 0.04 0 0.04), (Get-Quat 0 0 -0.04) )
$armLRotIdle = Build-QuatAccessor @( (Get-Quat 0.08 0 -0.18), (Get-Quat -0.08 0 -0.22), (Get-Quat 0.08 0 -0.18) )
$armRRotIdle = Build-QuatAccessor @( (Get-Quat -0.08 0 0.18), (Get-Quat 0.08 0 0.22), (Get-Quat -0.08 0 0.18) )
[void]$animations.Add(@{
    name = "Idle"
    samplers = @(
        @{ input = $tIdle; output = $hipsPosIdle; interpolation = "LINEAR" },
        @{ input = $tIdle; output = $headRotIdle; interpolation = "LINEAR" },
        @{ input = $tIdle; output = $armLRotIdle; interpolation = "LINEAR" },
        @{ input = $tIdle; output = $armRRotIdle; interpolation = "LINEAR" }
    )
    channels = @(
        @{ sampler = 0; target = @{ node = 1; path = "translation" } },
        @{ sampler = 1; target = @{ node = 3; path = "rotation" } },
        @{ sampler = 2; target = @{ node = 4; path = "rotation" } },
        @{ sampler = 3; target = @{ node = 5; path = "rotation" } }
    )
})

# 2. Run Animation (0.64s cycle)
$tRun = Add-FloatArray @(0.0, 0.16, 0.32, 0.48, 0.64) "SCALAR" 1 $true
$hipsPosRun = Build-Vec3Accessor @( @(0.0, 0.48, 0.0), @(0.0, 0.56, 0.0), @(0.0, 0.48, 0.0), @(0.0, 0.56, 0.0), @(0.0, 0.48, 0.0) )
$torsoRotRun = Build-QuatAccessor @( (Get-Quat 0.16 0.06 0), (Get-Quat 0.20 0 0), (Get-Quat 0.16 -0.06 0), (Get-Quat 0.20 0 0), (Get-Quat 0.16 0.06 0) )
$armLRotRun = Build-QuatAccessor @( (Get-Quat 0.85 0 -0.18), (Get-Quat 0 0 -0.18), (Get-Quat -0.85 0 -0.18), (Get-Quat 0 0 -0.18), (Get-Quat 0.85 0 -0.18) )
$armRRotRun = Build-QuatAccessor @( (Get-Quat -0.85 0 0.18), (Get-Quat 0 0 0.18), (Get-Quat 0.85 0 0.18), (Get-Quat 0 0 0.18), (Get-Quat -0.85 0 0.18) )
$legLRotRun = Build-QuatAccessor @( (Get-Quat -0.85 0 0), (Get-Quat 0 0 0), (Get-Quat 0.85 0 0), (Get-Quat 0 0 0), (Get-Quat -0.85 0 0) )
$legRRotRun = Build-QuatAccessor @( (Get-Quat 0.85 0 0), (Get-Quat 0 0 0), (Get-Quat -0.85 0 0), (Get-Quat 0 0 0), (Get-Quat 0.85 0 0) )
[void]$animations.Add(@{
    name = "Run"
    samplers = @(
        @{ input = $tRun; output = $hipsPosRun; interpolation = "LINEAR" },
        @{ input = $tRun; output = $torsoRotRun; interpolation = "LINEAR" },
        @{ input = $tRun; output = $armLRotRun; interpolation = "LINEAR" },
        @{ input = $tRun; output = $armRRotRun; interpolation = "LINEAR" },
        @{ input = $tRun; output = $legLRotRun; interpolation = "LINEAR" },
        @{ input = $tRun; output = $legRRotRun; interpolation = "LINEAR" }
    )
    channels = @(
        @{ sampler = 0; target = @{ node = 1; path = "translation" } },
        @{ sampler = 1; target = @{ node = 2; path = "rotation" } },
        @{ sampler = 2; target = @{ node = 4; path = "rotation" } },
        @{ sampler = 3; target = @{ node = 5; path = "rotation" } },
        @{ sampler = 4; target = @{ node = 6; path = "rotation" } },
        @{ sampler = 5; target = @{ node = 7; path = "rotation" } }
    )
})

# 3. Sprint Animation (0.40s fast cycle)
$tSprint = Add-FloatArray @(0.0, 0.10, 0.20, 0.30, 0.40) "SCALAR" 1 $true
$hipsPosSprint = Build-Vec3Accessor @( @(0.0, 0.46, 0.0), @(0.0, 0.62, 0.0), @(0.0, 0.46, 0.0), @(0.0, 0.62, 0.0), @(0.0, 0.46, 0.0) )
$torsoRotSprint = Build-QuatAccessor @( (Get-Quat 0.35 0.10 0), (Get-Quat 0.38 0 0), (Get-Quat 0.35 -0.10 0), (Get-Quat 0.38 0 0), (Get-Quat 0.35 0.10 0) )
$armLRotSprint = Build-QuatAccessor @( (Get-Quat 1.35 0 -0.22), (Get-Quat 0 0 -0.22), (Get-Quat -1.35 0 -0.22), (Get-Quat 0 0 -0.22), (Get-Quat 1.35 0 -0.22) )
$armRRotSprint = Build-QuatAccessor @( (Get-Quat -1.35 0 0.22), (Get-Quat 0 0 0.22), (Get-Quat 1.35 0 0.22), (Get-Quat 0 0 0.22), (Get-Quat -1.35 0 0.22) )
$legLRotSprint = Build-QuatAccessor @( (Get-Quat -1.25 0 0), (Get-Quat 0 0 0), (Get-Quat 1.25 0 0), (Get-Quat 0 0 0), (Get-Quat -1.25 0 0) )
$legRRotSprint = Build-QuatAccessor @( (Get-Quat 1.25 0 0), (Get-Quat 0 0 0), (Get-Quat -1.25 0 0), (Get-Quat 0 0 0), (Get-Quat 1.25 0 0) )
[void]$animations.Add(@{
    name = "Sprint"
    samplers = @(
        @{ input = $tSprint; output = $hipsPosSprint; interpolation = "LINEAR" },
        @{ input = $tSprint; output = $torsoRotSprint; interpolation = "LINEAR" },
        @{ input = $tSprint; output = $armLRotSprint; interpolation = "LINEAR" },
        @{ input = $tSprint; output = $armRRotSprint; interpolation = "LINEAR" },
        @{ input = $tSprint; output = $legLRotSprint; interpolation = "LINEAR" },
        @{ input = $tSprint; output = $legRRotSprint; interpolation = "LINEAR" }
    )
    channels = @(
        @{ sampler = 0; target = @{ node = 1; path = "translation" } },
        @{ sampler = 1; target = @{ node = 2; path = "rotation" } },
        @{ sampler = 2; target = @{ node = 4; path = "rotation" } },
        @{ sampler = 3; target = @{ node = 5; path = "rotation" } },
        @{ sampler = 4; target = @{ node = 6; path = "rotation" } },
        @{ sampler = 5; target = @{ node = 7; path = "rotation" } }
    )
})

# 4. Fall Animation (0.8s stumble & fall forward onto track)
$tFall = Add-FloatArray @(0.0, 0.25, 0.55, 0.80) "SCALAR" 1 $true
$hipsPosFall = Build-Vec3Accessor @( @(0.0, 0.48, 0.0), @(0.0, 0.55, 0.12), @(0.0, 0.18, 0.30), @(0.0, 0.20, 0.28) )
$hipsRotFall = Build-QuatAccessor @( (Get-Quat 0 0 0), (Get-Quat 0.55 0 0.08), (Get-Quat 1.38 0 -0.05), (Get-Quat 1.32 0 0) )
$armLRotFall = Build-QuatAccessor @( (Get-Quat 0.2 0 -0.2), (Get-Quat -1.6 0 -0.5), (Get-Quat -1.9 0 -0.4), (Get-Quat -1.7 0 -0.3) )
$armRRotFall = Build-QuatAccessor @( (Get-Quat 0.2 0 0.2), (Get-Quat -1.6 0 0.5), (Get-Quat -1.9 0 0.4), (Get-Quat -1.7 0 0.3) )
$legLRotFall = Build-QuatAccessor @( (Get-Quat 0 0 0), (Get-Quat 0.6 0 0), (Get-Quat 0.3 0 -0.15), (Get-Quat 0.4 0 -0.15) )
$legRRotFall = Build-QuatAccessor @( (Get-Quat 0 0 0), (Get-Quat -0.4 0 0), (Get-Quat 0.2 0 0.15), (Get-Quat 0.3 0 0.15) )
[void]$animations.Add(@{
    name = "Fall"
    samplers = @(
        @{ input = $tFall; output = $hipsPosFall; interpolation = "LINEAR" },
        @{ input = $tFall; output = $hipsRotFall; interpolation = "LINEAR" },
        @{ input = $tFall; output = $armLRotFall; interpolation = "LINEAR" },
        @{ input = $tFall; output = $armRRotFall; interpolation = "LINEAR" },
        @{ input = $tFall; output = $legLRotFall; interpolation = "LINEAR" },
        @{ input = $tFall; output = $legRRotFall; interpolation = "LINEAR" }
    )
    channels = @(
        @{ sampler = 0; target = @{ node = 1; path = "translation" } },
        @{ sampler = 1; target = @{ node = 1; path = "rotation" } },
        @{ sampler = 2; target = @{ node = 4; path = "rotation" } },
        @{ sampler = 3; target = @{ node = 5; path = "rotation" } },
        @{ sampler = 4; target = @{ node = 6; path = "rotation" } },
        @{ sampler = 5; target = @{ node = 7; path = "rotation" } }
    )
})

# 5. Recover Animation (0.5s get back up)
$tRec = Add-FloatArray @(0.0, 0.25, 0.50) "SCALAR" 1 $true
$hipsPosRec = Build-Vec3Accessor @( @(0.0, 0.20, 0.28), @(0.0, 0.38, 0.10), @(0.0, 0.48, 0.0) )
$hipsRotRec = Build-QuatAccessor @( (Get-Quat 1.32 0 0), (Get-Quat 0.45 0 0), (Get-Quat 0 0 0) )
$armLRotRec = Build-QuatAccessor @( (Get-Quat -1.7 0 -0.3), (Get-Quat -0.6 0 -0.2), (Get-Quat 0.08 0 -0.18) )
$armRRotRec = Build-QuatAccessor @( (Get-Quat -1.7 0 0.3), (Get-Quat -0.6 0 0.2), (Get-Quat -0.08 0 0.18) )
[void]$animations.Add(@{
    name = "Recover"
    samplers = @(
        @{ input = $tRec; output = $hipsPosRec; interpolation = "LINEAR" },
        @{ input = $tRec; output = $hipsRotRec; interpolation = "LINEAR" },
        @{ input = $tRec; output = $armLRotRec; interpolation = "LINEAR" },
        @{ input = $tRec; output = $armRRotRec; interpolation = "LINEAR" }
    )
    channels = @(
        @{ sampler = 0; target = @{ node = 1; path = "translation" } },
        @{ sampler = 1; target = @{ node = 1; path = "rotation" } },
        @{ sampler = 2; target = @{ node = 4; path = "rotation" } },
        @{ sampler = 3; target = @{ node = 5; path = "rotation" } }
    )
})

# 6. Cheer Animation (0.8s victory jump & wave)
$tCheer = Add-FloatArray @(0.0, 0.20, 0.40, 0.60, 0.80) "SCALAR" 1 $true
$hipsPosCheer = Build-Vec3Accessor @( @(0.0, 0.48, 0.0), @(0.0, 0.72, 0.0), @(0.0, 0.48, 0.0), @(0.0, 0.68, 0.0), @(0.0, 0.48, 0.0) )
$armLRotCheer = Build-QuatAccessor @( (Get-Quat 0 0 -2.6), (Get-Quat 0 0 -2.9), (Get-Quat 0 0 -2.5), (Get-Quat 0 0 -2.9), (Get-Quat 0 0 -2.6) )
$armRRotCheer = Build-QuatAccessor @( (Get-Quat 0 0 2.6), (Get-Quat 0 0 2.9), (Get-Quat 0 0 2.5), (Get-Quat 0 0 2.9), (Get-Quat 0 0 2.6) )
[void]$animations.Add(@{
    name = "Cheer"
    samplers = @(
        @{ input = $tCheer; output = $hipsPosCheer; interpolation = "LINEAR" },
        @{ input = $tCheer; output = $armLRotCheer; interpolation = "LINEAR" },
        @{ input = $tCheer; output = $armRRotCheer; interpolation = "LINEAR" }
    )
    channels = @(
        @{ sampler = 0; target = @{ node = 1; path = "translation" } },
        @{ sampler = 1; target = @{ node = 4; path = "rotation" } },
        @{ sampler = 2; target = @{ node = 5; path = "rotation" } }
    )
})

Align-Stream
$binBytes = $ms.ToArray()
$bw.Close()
$ms.Close()

$gltf = [ordered]@{
    asset = @{
        version = "2.0"
        generator = "Blender 4.0 / MathTrack3D GLB Exporter"
    }
    scene = 0
    scenes = @(
        @{ name = "CharacterScene"; nodes = @(0) }
    )
    nodes = $nodes
    meshes = $meshes
    materials = $materials
    animations = $animations
    accessors = $accessors
    bufferViews = $bufferViews
    buffers = @(
        @{ byteLength = $binBytes.Length }
    )
}

$jsonStr = $gltf | ConvertTo-Json -Depth 12 -Compress
$jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
$jsonPad = (4 - ($jsonBytes.Length % 4)) % 4
$jsonChunkLength = $jsonBytes.Length + $jsonPad

$binPad = (4 - ($binBytes.Length % 4)) % 4
$binChunkLength = $binBytes.Length + $binPad

$totalLength = 12 + 8 + $jsonChunkLength + 8 + $binChunkLength

$outMs = New-Object System.IO.MemoryStream
$outBw = New-Object System.IO.BinaryWriter($outMs)

# GLB Header
$outBw.Write([uint32]0x46546C67) # 'glTF'
$outBw.Write([uint32]2)          # version 2
$outBw.Write([uint32]$totalLength)

# JSON Chunk
$outBw.Write([uint32]$jsonChunkLength)
$outBw.Write([uint32]0x4E4F534A) # 'JSON'
$outBw.Write($jsonBytes)
for ($i = 0; $i -lt $jsonPad; $i++) { $outBw.Write([byte]0x20) } # pad with space

# BIN Chunk
$outBw.Write([uint32]$binChunkLength)
$outBw.Write([uint32]0x004E4942) # 'BIN\0'
$outBw.Write($binBytes)
for ($i = 0; $i -lt $binPad; $i++) { $outBw.Write([byte]0x00) }

$glbBytes = $outMs.ToArray()
$outBw.Close()
$outMs.Close()

$glbPath = Join-Path $assetsDir "character_rigged.glb"
[System.IO.File]::WriteAllBytes($glbPath, $glbBytes)

# Also write Base64 fallback in js/glb-data.js so GLTFLoader works even on file://
$b64 = [Convert]::ToBase64String($glbBytes)
$jsContent = "// Auto-generated GLTF 2.0 binary (.glb) fallback for file:// protocol`nwindow.CHARACTER_GLB_BASE64 = `"$b64`";`n"
$jsPath = Join-Path $jsDir "glb-data.js"
[System.IO.File]::WriteAllText($jsPath, $jsContent, [System.Text.Encoding]::UTF8)

Write-Output "Successfully generated $glbPath ($($glbBytes.Length) bytes) and $jsPath"
