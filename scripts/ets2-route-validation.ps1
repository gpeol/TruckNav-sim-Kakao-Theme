# Validate both independently read waypoint arrays against the physical route.
# Some game states store the same waypoints in reverse order in the second copy.
function Resolve-VerifiedWaypoints {
  param(
    [long[]]$First,
    [long[]]$Second,
    [long[]]$RouteNodes,
    [object[]]$RoutePoints
  )
  if ($First.Count -ne $Second.Count -or $First.Count -gt 50 -or $RouteNodes.Count -eq 0 -or $RouteNodes.Count -ne $RoutePoints.Count) { return $null }
  $reversed = [long[]]$Second.Clone()
  [Array]::Reverse($reversed)
  if (($First -join ',') -ne ($Second -join ',') -and ($First -join ',') -ne ($reversed -join ',')) { return $null }

  if ($First.Count -eq 0) {
    $last = $RoutePoints[$RoutePoints.Count - 1]
    $result = [System.Collections.Generic.List[object]]::new()
    $result.Add(@($last[0], $last[1]))
    return @{waypoints=$result}
  }

  $candidates = [System.Collections.Generic.List[object]]::new()
  $candidates.Add($First)
  $candidates.Add($Second)
  foreach ($candidate in $candidates) {
    $lastIndex = -1
    $waypoints = [System.Collections.Generic.List[object]]::new()
    $valid = $true
    foreach ($address in $candidate) {
      $index = [Array]::IndexOf($RouteNodes, [long]$address, $lastIndex + 1)
      if ($index -lt 0) { $valid = $false; break }
      $waypoints.Add(@($RoutePoints[$index][0], $RoutePoints[$index][1]))
      $lastIndex = $index
    }
    if ($valid -and $lastIndex -eq $RouteNodes.Count - 1) { return @{waypoints=$waypoints} }
  }
  return $null
}
