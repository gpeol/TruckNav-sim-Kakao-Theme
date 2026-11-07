export interface DirectionStep {
    id: number;
    type:
        | "depart"
        | "straight"
        | "left"
        | "right"
        | "slight-left"
        | "slight-right"
        | "sharp-left"
        | "sharp-right"
        | "ferry"
        | "roundabout"
        | "destination"
        | "exit-highway";
    text: string;
    distance: number;
    coords: [number, number];
    exitCoords?: [number, number];
    debugAngle?: number;
    debugPrefabId?: number;
    exitCount?: number;
    exitClock?: number;
    cumulativeKm?: number;
    exitCumulativeKm?: number;
}

/** Clock direction relative to the approach, using the actual exit edge. */
export function roundaboutExitClock(
    approachStart?: [number, number], approachEnd?: [number, number],
    exitStart?: [number, number], exitEnd?: [number, number],
): number | undefined {
    if (!approachStart || !approachEnd || !exitStart || !exitEnd) return undefined;
    if (![...approachStart, ...approachEnd, ...exitStart, ...exitEnd].every(Number.isFinite)) return undefined;
    const bearing = (a: [number, number], b: [number, number]) => {
        const x = (b[0] - a[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360);
        const y = b[1] - a[1];
        return Math.hypot(x, y) < 1e-8 ? undefined : Math.atan2(x, y);
    };
    const incoming = bearing(approachStart, approachEnd);
    const outgoing = bearing(exitStart, exitEnd);
    if (incoming === undefined || outgoing === undefined) return undefined;
    return ((Math.round((outgoing - incoming) * 6 / Math.PI) % 12) + 12) % 12 || 12;
}

/** Derive approach and exit bearings from the actual road geometry. */
export function roundaboutClockFromEdges(
    geometry: Float32Array | null,
    approach?: { startIndex: number; pointCount: number },
    exit?: { startIndex: number; pointCount: number },
): number | undefined {
    if (!geometry || !approach || !exit) return undefined;
    const edgePoints = (edge: { startIndex: number; pointCount: number }, fromEnd: boolean): [[number, number], [number, number]] | undefined => {
        const { startIndex, pointCount } = edge;
        if (!Number.isInteger(startIndex) || !Number.isInteger(pointCount) || startIndex < 0 || pointCount < 2 || startIndex + pointCount * 2 > geometry.length) return undefined;
        const point = (index: number): [number, number] => [geometry[startIndex + index * 2]!, geometry[startIndex + index * 2 + 1]!];
        const anchor = point(fromEnd ? pointCount - 1 : 0);
        for (let j = 1; j < pointCount; j++) {
            const other = point(fromEnd ? pointCount - 1 - j : j);
            if (![...anchor, ...other].every(Number.isFinite)) return undefined;
            if (Math.hypot(anchor[0] - other[0], anchor[1] - other[1]) >= 0.000005) return fromEnd ? [other, anchor] : [anchor, other];
        }
        return undefined;
    };
    const incoming = edgePoints(approach, true);
    const outgoing = edgePoints(exit, false);
    return incoming && outgoing ? roundaboutExitClock(...incoming, ...outgoing) : undefined;
}

export function generateDirectionsList(
    nodeSequence: number[],
    nodeKms: Float32Array,
    sequenceManeuvers: Int8Array,
    sequenceExits: Int8Array,
    nodeCoords: Map<number, [number, number]>,
    sequenceRoundaboutClocks?: Int8Array,
): DirectionStep[] {
    const steps: DirectionStep[] = [];
    if (nodeSequence.length < 2) return steps;

    steps.push({
        id: 0,
        type: "depart",
        text: "Head on Route",
        distance: 0,
        coords: nodeCoords.get(nodeSequence[0]!) || [0, 0],
    });

    let lastStepKm = 0;
    let inRoundabout = false;

    for (let i = 0; i < nodeSequence.length - 1; i++) {
        const curr = nodeSequence[i];
        const maneuver = sequenceManeuvers[i]!;

        if (maneuver === 3) {
            if (inRoundabout) continue;
            inRoundabout = true;
        } else {
            inRoundabout = false;
        }

        if (maneuver > 0 && maneuver !== 4) {
            let turnType: DirectionStep["type"] = "straight";
            let turnText = "";
            let exitCount = sequenceExits[i]!;
            let exitClock: number | undefined;
            let turnEndIndex = i + 1;

            switch (maneuver) {
                case 1:
                    turnType = "left";
                    turnText = "Turn left";
                    break;
                case 2:
                    turnType = "right";
                    turnText = "Turn right";
                    break;
                case 3: {
                    turnType = "roundabout";
                    let exitIndex = i + 1;
                    while (exitIndex < nodeSequence.length - 1 && sequenceManeuvers[exitIndex] === 3 && sequenceExits[exitIndex] !== -2) exitIndex++;
                    exitClock = sequenceRoundaboutClocks?.[i] || undefined;
                    if (exitIndex < nodeSequence.length && sequenceManeuvers[exitIndex] !== 3) turnEndIndex = exitIndex;
                    if (sequenceManeuvers[exitIndex] === 3 && sequenceExits[exitIndex] === -2) {
                        turnEndIndex = exitIndex + 1;
                        if (i > 0 && !exitClock) {
                            exitClock = roundaboutExitClock(
                                nodeCoords.get(nodeSequence[i - 1]!), nodeCoords.get(curr!),
                                nodeCoords.get(nodeSequence[exitIndex]!), nodeCoords.get(nodeSequence[exitIndex + 1]!),
                            );
                        }
                    }
                    if (exitCount && exitCount > 0) {
                        const suffix =
                            exitCount === 1
                                ? "st"
                                : exitCount === 2
                                  ? "nd"
                                  : exitCount === 3
                                    ? "rd"
                                    : "th";
                        turnText = `${exitCount}${suffix} exit`;
                    } else {
                        turnText = `exit at the roundabout`;
                    }
                    break;
                }
                case 5:
                    turnType = "exit-highway";
                    turnText = "Take the exit";
                    break;
                case 6:
                    turnType = "slight-left";
                    turnText = "Keep left";
                    break;
                case 7:
                    turnType = "slight-right";
                    turnText = "Keep right";
                    break;
            }

            if (turnText !== "") {
                steps[steps.length - 1]!.distance = nodeKms[i]! - lastStepKm;
                steps.push({
                    id: curr!,
                    type: turnType,
                    text: turnText,
                    distance: 0,
                    cumulativeKm: nodeKms[i],
                    exitCumulativeKm: nodeKms[turnEndIndex],
                    coords: nodeCoords.get(curr!) || [0, 0],
                    exitCoords: nodeCoords.get(nodeSequence[turnEndIndex]!) || [0, 0],
                    exitCount: exitCount > 0 ? exitCount : undefined,
                    exitClock,
                });
                lastStepKm = nodeKms[i]!;
            }
        }
    }

    // Add Destination
    const totalKm = nodeKms[nodeSequence.length - 1];
    steps[steps.length - 1]!.distance = Math.max(0, totalKm! - lastStepKm);
    steps.push({
        id: nodeSequence[nodeSequence.length - 1]!,
        type: "destination",
        text: "Arrived",
        distance: 0,
        coords: nodeCoords.get(nodeSequence[nodeSequence.length - 1]!) || [
            0, 0,
        ],
    });

    return steps;
}
