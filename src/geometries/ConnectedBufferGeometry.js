import * as THREE from 'three';

// A ConnectedBufferGeometry is a BufferGeometry with additional
// neighbor information.  The neighbor information maintains which
// face is connected to which face by which edge.
class ConnectedBufferGeometry extends THREE.BufferGeometry {
    constructor() {
        super();
        // neighbors has length the same as faces*3.  Each element is
        // the position of the neighboring faceEdge.
        this.neighbors = [];
    }

    fromBufferGeometry(bufferGeometry) {
        this.copy(bufferGeometry);
        this.findNeighbors();
        return this;
    }

    keyForTrio(startIndex, precisionPoints = 4) {
        let array = this.getAttribute('position').array;
        let [v1, v2, v3] = [array[startIndex], array[startIndex+1], array[startIndex+2]];
        if (precisionPoints >= 0) {
            var precision = Math.pow( 10, precisionPoints );
            return Math.round( v1 * precision ) + '_' + Math.round( v2 * precision ) + '_' + Math.round( v3 * precision );
        } else {
            return v1 + '_' + v2 + '_' + v3;
        }
    }

    vertexPositionMap(precisionPoints) {
        let map = new Map();
        let positions = this.getAttribute('position').array;
        for (var posIndex = 0; posIndex < positions.length; posIndex += 3) {
            let key = this.keyForTrio(posIndex, precisionPoints);
            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key).push(posIndex);
        }
        return map;
    }

    // Recalculate the neighbors.
    findNeighbors() {
        let originalPositions = this.getAttribute('position').array;
        let precisionPoints = -1;
        var vertexPosMap = this.vertexPositionMap(precisionPoints);

        const faceCount = originalPositions.length / 9;
        // Given a faceIndex (0 to faceCount-1), return position in originalPositions.
        let positionFromFace = function (faceIndex) {
            return faceIndex*9;
        }
        // Given an index in originalPositions, return the face (0 to facecount-1).
        let faceFromPosition = function (positionIndex) {
            return Math.floor(positionIndex/9);
        }
        // Given an index in originalPositions, return the edge (0 to 2).
        let edgeFromPosition = function (positionIndex) {
            return (positionIndex % 9) / 3;
        }
        // Given a faceIndex (0 to faceCount-1) and edgeIndex (0 to 2), return position in originalPositions.
        let positionFromFaceEdge = function (faceIndex, edgeIndex) {
            return positionFromFace(faceIndex) + 3*edgeIndex;
        }
        // Given index in originalPositions, return a Vector3 of that point.
        let vector3FromPosition = function (position) {
            return new THREE.Vector3().fromArray(originalPositions, position);
        }
        // Gets the next position in the face, which is the next point
        // unless we're at the end and then it's the first point.
        let nextPositionInFace = function (posIndex) {
            if (posIndex % 9 == 6) {
                return posIndex - 6;
            } else {
                return posIndex + 3;
            }
        }
        // Gets the previous position in the face, which is the
        // previous point unless we're at the start and then it's the
        // last point.
        let previousPositionInFace = function (posIndex) {
            if (posIndex % 9 == 0) {
                return posIndex + 6;
            } else {
                return posIndex - 3;
            }
        }

        // Returns true if the faceIndex (0 to faceCount-1) has two
        // identical points in it.
        let isFaceDegenerate = (faceIndex) => {
            let facePoints = new Set();
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                facePoints.add(this.keyForTrio(positionFromFaceEdge(faceIndex, edgeIndex), precisionPoints));
            }
            return facePoints.size != 3;
        }

        // Find the island to which this face belongs using the
        // union-join algorithm.
        let findIsland = function (faceIndex) {
            if (faces[faceIndex].island != null && faces[faceIndex].island != faceIndex) {
                faces[faceIndex].island = findIsland(faces[faceIndex].island)
            }
            return faces[faceIndex].island;
        }
        // Join the islands to which face1 and face2 belong.  Returns
        // the new joined root, for convenience.
        let joinIslands = function (face1, face2) {
            // Union join needed?
            let root1 = findIsland(face1);
            let root2 = findIsland(face2);
            let newRoot = root1;
            if (root1 != root2) {
                // Yes, need to join.
                if (faces[root1].rank < faces[root2].rank) {
                    faces[root1].island = root2;
                    newRoot = root2;
                } else if (faces[root2].rank < faces[root1].rank) {
                    faces[root2].island = root1;
                    newRoot = root1;
                } else {
                    faces[root2].island = root1;
                    faces[root1].rank++;
                    newRoot = root1;
                }
            }
            return newRoot;
        }

        let faces = [];
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            let degenerate = isFaceDegenerate(faceIndex);
            faces[faceIndex] = {
                // possibleNeighbors is an array of length 3, one for each edge.
                // edge 0 is from point a to b, edge 1 is from b to c, edge 2 is from c to a
                // each element is a map of position indices to angles that could be neighbors for this face.
                // The angle is only computed if needed, otherwise it's null.
                'possibleNeighbors': [new Map(), new Map(), new Map()],
                // These are selected neighbors, null until they are found.
                'neighbors': [null, null, null],
                // Are all three vertices unique?
                'degenerate': degenerate,
                // At first, each face is an island by itself.  Later, we'll join faces.
                'island': degenerate ? null : faceIndex,
                // The below elements are only valid if faces[faceIndex].island = faceIndex;
                // The rank for the union-join algorithm on islands.
                'rank': degenerate ? null : 0
            };
        }

        // Edges that aren't yet in a face-to-face connection.
        let unconnectedEdges = new Set();
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            if (faces[faceIndex].degenerate) {
                continue;
            }
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let posIndex = positionFromFaceEdge(faceIndex, edgeIndex);
                let key = this.keyForTrio(posIndex, precisionPoints);
                let keyNext = this.keyForTrio(nextPositionInFace(posIndex), precisionPoints);
                for (let newPosIndex of vertexPosMap.get(key)) {
                    // A face is only neighboring if the edges are in
                    // common and point in opposite directions.
                    let newKeyPrevious = this.keyForTrio(previousPositionInFace(newPosIndex), precisionPoints);
                    if (keyNext != newKeyPrevious) {
                        continue;
                    }
                    // This neighboring face is connected.
                    // We'll ignore degenerate triangles.
                    if (faces[faceFromPosition(newPosIndex)].degenerate) {
                        continue;
                    }
                    // We're able to connect to the edge newKey and newKeyPrevious, which is the newKeyPrevious edge.
                    faces[faceIndex].possibleNeighbors[edgeIndex].set(previousPositionInFace(newPosIndex), null);
                }
                unconnectedEdges.add(posIndex);
            }
        }

        // Set the face-edge at posIndex2 to be the neighbor of the
        // face-edge at posIndex1.  This function should also be run
        // with arguments swapped to make the connection symmetric.
        let setNeighbor = function (posIndex1, posIndex2) {
            let face1 = faceFromPosition(posIndex1);
            let edge1 = edgeFromPosition(posIndex1);
            // Remove posIndex1 as possible neighbor for all its neighbors.
            for (let possibleNeighbor of faces[face1].possibleNeighbors[edge1].keys()) {
                let possibleNeighborFace = faceFromPosition(possibleNeighbor);
                let possibleNeighborEdge = edgeFromPosition(possibleNeighbor);
                faces[possibleNeighborFace].possibleNeighbors[possibleNeighborEdge].delete(posIndex1);
            }
            // Remove all neighbors of posIndex1
            faces[face1].possibleNeighbors[edge1].clear();
            // Set actual neighbor.
            faces[face1].neighbors[edge1] = posIndex2;
        }
        // Connect the face-edges as posIndex1 and posIndex2.  This
        // also updates the unconnectedEdges Set.
        let connectEdge = function (posIndex1, posIndex2) {
            setNeighbor(posIndex1, posIndex2);
            setNeighbor(posIndex2, posIndex1);

            let islandIndex = joinIslands(faceFromPosition(posIndex1), faceFromPosition(posIndex2));
            // Finally, remove from the set of edges that still need to be resolved.
            unconnectedEdges.delete(posIndex1);
            unconnectedEdges.delete(posIndex2);
        }
        // Returns the unit normal of a triangular face.
        let faceNormal = function (faceIndex) {
            return new THREE.Triangle(
                vector3FromPosition(positionFromFaceEdge(faceIndex, 0)),
                vector3FromPosition(positionFromFaceEdge(faceIndex, 1)),
                vector3FromPosition(positionFromFaceEdge(faceIndex, 2))).normal();
        }
        // Returns the angle between faces 0 to 2pi.
        // A smaller angle indicates less enclosed space.
        // Assumes that the common edge is posIndex1 to posIndex1+3 and
        // posIndex2 to posIndex2-3.
        let facesAngle = function (posIndex1, posIndex2) {
            let normal1 = faceNormal(faceFromPosition(posIndex1));
            let normal2 = faceNormal(faceFromPosition(posIndex2));
            let commonPoint1 = vector3FromPosition(posIndex1);
            let commonPoint2 = vector3FromPosition(nextPositionInFace(posIndex1));
            let edge1 = commonPoint2.clone().sub(commonPoint1);
            let normalsAngle = normal1.angleTo(normal2); // Between 0 and pi.
            let facesAngle = Math.PI;
            if (normal1.clone().cross(normal2).dot(edge1) > 0) {
                facesAngle -= normalsAngle;
            } else {
                facesAngle += normalsAngle;
            }
            return facesAngle;
        }

        // Given the faceIndex of an island, find all unconnected
        // edges of that island.  Returns a set of indices into the
        // positions.
        let calculateFrontier = function (islandIndex) {
            let visitedFaces = new Set();
            let frontier = new Set();
            let visit = function (faceIndex) {
                if (!visitedFaces.has(faceIndex)) {
                    visitedFaces.add(faceIndex);
                    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                        let neighbor = faces[faceIndex].neighbors[edgeIndex];
                        if (neighbor === null) {
                            // No neighbor so this edge is on the frontier.
                            frontier.add(positionFromFaceEdge(faceIndex, edgeIndex));
                        } else {
                            // Visit the neighbor.
                            visit(faceFromPosition(neighbor));
                        }
                    }
                }
            }
            visit(islandIndex);
            return frontier;
        }

        while (unconnectedEdges.size > 0) {
            let foundOne = false;
            // Connect all edges that have just one neighbor.
            for (let posIndex of unconnectedEdges) {
                let faceIndex = faceFromPosition(posIndex);
                let edgeIndex = edgeFromPosition(posIndex);
                if (faces[faceIndex].neighbors[edgeIndex] == null &&
                    faces[faceIndex].possibleNeighbors[edgeIndex].size == 1) {
                    connectEdge(positionFromFaceEdge(faceIndex, edgeIndex),
                                faces[faceIndex].possibleNeighbors[edgeIndex].keys().next().value);
                    foundOne = true;
                }
            }
            if (foundOne) {
                continue;
            }
            // Try to join faces that are on the frontier of an
            // island.  This makes for shapes that are smaller and better split.
            let visitedIslands = new Set();
            for (let posIndex of unconnectedEdges) {
                let islandIndex = findIsland(faceFromPosition(posIndex));
                if (!visitedIslands.has(islandIndex)) {
                    // This is an unchecked island, now we look for
                    // connectable edges on the frontier.
                    visitedIslands.add(islandIndex); // Mark as visited.
                    let frontier = calculateFrontier(islandIndex);
                    for (let posIndex of frontier) {
                        let faceIndex = faceFromPosition(posIndex);
                        let edgeIndex = edgeFromPosition(posIndex);
                        for (let neighborPosIndex of faces[faceIndex].possibleNeighbors[edgeIndex].keys()) {
                            if (frontier.has(neighborPosIndex)) {
                                // Two frontier edges that can be connected.
                                connectEdge(posIndex, neighborPosIndex);
                                foundOne = true;
                            }
                        }
                    }
                }
            }
            if (foundOne) {
                continue;
            }
            // By here, each possibleNeighbor list has >1 or <1
            // elements.  Get rid of the worst possibleNeighbor.  The
            // worst possibleNeighbor is a sliver.  A sliver is
            // two faces with a separation very close to 0 or 2 pi,
            // ie, far from pi.  We don't expect those to be in a
            // properly built shape so they are usually an indication
            // of two shapes sharing a face.
            let worstPos;
            let worstOtherPos;
            let worstAngle = -Infinity;
            for (let posIndex of unconnectedEdges) {
                let faceIndex = faceFromPosition(posIndex);
                let edgeIndex = edgeFromPosition(posIndex);
                for (let otherPosIndex of faces[faceIndex].possibleNeighbors[edgeIndex].keys()) {
                    let angle = faces[faceIndex].possibleNeighbors[edgeIndex].get(otherPosIndex);
                    if (angle === null) {
                        // Compute the angle between this face and the connected face.
                        angle = facesAngle(posIndex, nextPositionInFace(otherPosIndex));
                        faces[faceIndex].possibleNeighbors[edgeIndex].set(otherPosIndex, angle);
                    }
                    // The worst angle is the largest one.
                    if (angle > worstAngle) {
                        worstAngle = angle;
                        worstPos = posIndex;
                        worstOtherPos = otherPosIndex;
                    }
                }
            }
            if (worstAngle != -Infinity) { // This had better be true!
                // Remove the possible neighbor in both directions.
                faces[faceFromPosition(worstPos)].possibleNeighbors[edgeFromPosition(worstPos)].delete(worstOtherPos);
                faces[faceFromPosition(worstOtherPos)].possibleNeighbors[edgeFromPosition(worstOtherPos)].delete(worstPos);
                foundOne = true;
            }
        }

        // All done, now save the result.
        this.neighbors = [];
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let neighbor = faces[faceIndex].neighbors[edgeIndex];
                this.neighbors[faceIndex*3 + edgeIndex] = neighbor === null ? null : neighbor / 3;
            }
        }
    }
}

export { ConnectedBufferGeometry };
