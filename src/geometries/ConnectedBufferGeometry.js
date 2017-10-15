import * as THREE from 'three';

// A ConnectedBufferGeometry is similar to a BufferGeometry with
// additional neighbor information.  The neighbor information
// maintains which face is connected to which face by which edge.
class ConnectedBufferGeometry {
    constructor() {
        // An array of numbers.  Every triple represents a point.
        // Every 3 points is a face.
        this.positions = [];
        // An array of numbers.  Every triple represents an RGB for a
        // point corresponding to the point in positions.
        this.colors = [];
        // neighbors has length the same as faces*3.  Each element is
        // the position of the neighboring faceEdge.
        this.neighbors = [];
        // A list as long as the number of faces.  Each element is a
        // number that identifies an island.  All faces that have the
        // same island number are part of the same shape.  faces that
        // have null island are degenerate and not part of any shape.
        this.reverseIslands = [];
    }

    fromBufferGeometry(bufferGeometry) {
        this.positions = Array.from(bufferGeometry.getAttribute('position').array);
        this.colors = bufferGeometry.getAttribute('color') && Array.from(bufferGeometry.getAttribute('color').array);
        this.findNeighbors();
        return this;
    }

    keyForTrio(startIndex, precisionPoints = -1) {
        let array = this.positions;
        let [v1, v2, v3] = [array[startIndex], array[startIndex+1], array[startIndex+2]];
        if (precisionPoints >= 0) {
            var precision = Math.pow( 10, precisionPoints );
            return Math.round( v1 * precision ) + '_' + Math.round( v2 * precision ) + '_' + Math.round( v3 * precision );
        } else {
            return v1 + '_' + v2 + '_' + v3;
        }
    }

    keyForVector3(vector3, precisionPoints = -1) {
        let [v1, v2, v3] = [vector3.x, vector3.y, vector3.z];
        if (precisionPoints >= 0) {
            var precision = Math.pow( 10, precisionPoints );
            return Math.round( v1 * precision ) + '_' + Math.round( v2 * precision ) + '_' + Math.round( v3 * precision );
        } else {
            return v1 + '_' + v2 + '_' + v3;
        }
    }

    vertexPositionMap(precisionPoints = -1) {
        let map = new Map();
        for (var posIndex = 0; posIndex < this.positions.length; posIndex += 3) {
            let key = this.keyForTrio(posIndex, precisionPoints);
            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key).push(posIndex);
        }
        return map;
    }

    // Given a faceIndex (0 to faceCount-1), return position in originalPositions.
    positionFromFace(faceIndex) {
        return faceIndex*9;
    }

    // Given an index in originalPositions, return the face (0 to facecount-1).
    faceFromPosition(positionIndex) {
        return Math.floor(positionIndex/9);
    }
    // Given an index in originalPositions, return the edge (0 to 2).
    edgeFromPosition(positionIndex) {
        return (positionIndex % 9) / 3;
    }
    // Given a faceIndex (0 to faceCount-1) and edgeIndex (0 to 2), return position in originalPositions.
    positionFromFaceEdge(faceIndex, edgeIndex) {
        return this.positionFromFace(faceIndex) + 3*edgeIndex;
    }
    // Given index in originalPositions, return a Vector3 of that point.
    vector3FromPosition(position, positions) {
        return new THREE.Vector3().fromArray(positions, position);
    }
    // Given index in originalPositions, return a Vector3 of that point.
    colorFromPosition(position, colors) {
        return new THREE.Color().fromArray(this.colors, position);
    }

    // Gets the position of an adjacent vertex in the face.  If direction is +3, go forward.  If -3, go to previous.
    otherPositionInFace(posIndex, direction) {
        let faceDifference = this.faceFromPosition(posIndex + direction) - this.faceFromPosition(posIndex);
        return posIndex + direction - this.positionFromFace(faceDifference);
    }
    // Gets the next position in the face, which is the next point
    // unless we're at the end and then it's the first point.
    nextPositionInFace(posIndex) {
        return this.otherPositionInFace(posIndex, 3);
    }
    // Gets the previous position in the face, which is the
    // previous point unless we're at the start and then it's the
    // last point.
    previousPositionInFace(posIndex) {
        return this.otherPositionInFace(posIndex, -3);
    }

    // Returns true if the faceIndex (0 to faceCount-1) has two
    // identical points in it.
    isFaceDegenerate(faceIndex) {
        let facePoints = new Set();
        for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
            facePoints.add(this.keyForTrio(this.positionFromFaceEdge(faceIndex, edgeIndex)));
        }
        return facePoints.size != 3;
    }

    // Recalculate the neighbors.
    // this.neighbors will be an array with length 3 times the number of faces.
    // Each element is the connection between
    findNeighbors() {
        var vertexPosMap = this.vertexPositionMap();
        const faceCount = this.positions.length / 9;

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
            let degenerate = this.isFaceDegenerate(faceIndex);
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
                let posIndex = this.positionFromFaceEdge(faceIndex, edgeIndex);
                let key = this.keyForTrio(posIndex);
                let keyNext = this.keyForTrio(this.nextPositionInFace(posIndex));
                for (let newPosIndex of vertexPosMap.get(key)) {
                    // A face is only neighboring if the edges are in
                    // common and point in opposite directions.
                    let newKeyPrevious = this.keyForTrio(this.previousPositionInFace(newPosIndex));
                    if (keyNext != newKeyPrevious) {
                        continue;
                    }
                    // This neighboring face is connected.
                    // We'll ignore degenerate triangles.
                    if (faces[this.faceFromPosition(newPosIndex)].degenerate) {
                        continue;
                    }
                    // We're able to connect to the edge newKey and newKeyPrevious, which is the newKeyPrevious edge.
                    faces[faceIndex].possibleNeighbors[edgeIndex].set(this.previousPositionInFace(newPosIndex), null);
                }
                unconnectedEdges.add(posIndex);
            }
        }

        // Set the face-edge at posIndex2 to be the neighbor of the
        // face-edge at posIndex1.  This function should also be run
        // with arguments swapped to make the connection symmetric.
        let setNeighbor = (posIndex1, posIndex2) => {
            let face1 = this.faceFromPosition(posIndex1);
            let edge1 = this.edgeFromPosition(posIndex1);
            // Remove posIndex1 as possible neighbor for all its neighbors.
            for (let possibleNeighbor of faces[face1].possibleNeighbors[edge1].keys()) {
                let possibleNeighborFace = this.faceFromPosition(possibleNeighbor);
                let possibleNeighborEdge = this.edgeFromPosition(possibleNeighbor);
                faces[possibleNeighborFace].possibleNeighbors[possibleNeighborEdge].delete(posIndex1);
            }
            // Remove all neighbors of posIndex1
            faces[face1].possibleNeighbors[edge1].clear();
            // Set actual neighbor.
            faces[face1].neighbors[edge1] = posIndex2;
        }
        // Connect the face-edges as posIndex1 and posIndex2.  This
        // also updates the unconnectedEdges Set.
        let connectEdge = (posIndex1, posIndex2) => {
            setNeighbor(posIndex1, posIndex2);
            setNeighbor(posIndex2, posIndex1);

            let islandIndex = joinIslands(this.faceFromPosition(posIndex1), this.faceFromPosition(posIndex2));
            // Finally, remove from the set of edges that still need to be resolved.
            unconnectedEdges.delete(posIndex1);
            unconnectedEdges.delete(posIndex2);
        }

        // Returns the angle between faces 0 to 2pi.
        // A smaller angle indicates less enclosed space.
        // Assumes that the common edge is posIndex1 to posIndex1+3 and
        // posIndex2 to posIndex2-3.
        let facesAngle = (posIndex1, posIndex2) => {
            let normal1 = this.faceNormal(this.faceFromPosition(posIndex1));
            let normal2 = this.faceNormal(this.faceFromPosition(posIndex2));
            let commonPoint1 = this.vector3FromPosition(posIndex1, this.positions);
            let commonPoint2 = this.vector3FromPosition(this.nextPositionInFace(posIndex1), this.positions);
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
        let calculateFrontier = (islandIndex) => {
            let visitedFaces = new Set();
            let frontier = new Set();
            let visit = (faceIndex) => {
                if (!visitedFaces.has(faceIndex)) {
                    visitedFaces.add(faceIndex);
                    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                        let neighbor = faces[faceIndex].neighbors[edgeIndex];
                        if (neighbor === null) {
                            // No neighbor so this edge is on the frontier.
                            frontier.add(this.positionFromFaceEdge(faceIndex, edgeIndex));
                        } else {
                            // Visit the neighbor.
                            visit(this.faceFromPosition(neighbor));
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
                let faceIndex = this.faceFromPosition(posIndex);
                let edgeIndex = this.edgeFromPosition(posIndex);
                if (faces[faceIndex].neighbors[edgeIndex] == null &&
                    faces[faceIndex].possibleNeighbors[edgeIndex].size == 1) {
                    connectEdge(this.positionFromFaceEdge(faceIndex, edgeIndex),
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
                let islandIndex = findIsland(this.faceFromPosition(posIndex));
                if (!visitedIslands.has(islandIndex)) {
                    // This is an unchecked island, now we look for
                    // connectable edges on the frontier.
                    visitedIslands.add(islandIndex); // Mark as visited.
                    let frontier = calculateFrontier(islandIndex);
                    for (let posIndex of frontier) {
                        let faceIndex = this.faceFromPosition(posIndex);
                        let edgeIndex = this.edgeFromPosition(posIndex);
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
            let worstAngle = null;
            for (let posIndex of unconnectedEdges) {
                let faceIndex = this.faceFromPosition(posIndex);
                let edgeIndex = this.edgeFromPosition(posIndex);
                for (let otherPosIndex of faces[faceIndex].possibleNeighbors[edgeIndex].keys()) {
                    let angle = faces[faceIndex].possibleNeighbors[edgeIndex].get(otherPosIndex);
                    if (angle === null) {
                        // Compute the angle between this face and the connected face.
                        angle = facesAngle(posIndex, this.nextPositionInFace(otherPosIndex));
                        faces[faceIndex].possibleNeighbors[edgeIndex].set(otherPosIndex, angle);
                    }
                    const EPSILON = 0.001;
                    let differenceFrom180 = Math.abs(Math.PI-angle);
                    let worstDifferenceFrom180 = Math.abs(Math.PI-worstAngle);
                    // The worst angle is anything too close to 0 or
                    // 2PI.  After that, remove the largest one.
                    if (worstAngle === null ||
                        worstDifferenceFrom180 > Math.PI-EPSILON && differenceFrom180 >= worstDifferenceFrom180 ||
                        !(worstDifferenceFrom180 > Math.PI-EPSILON) && angle > worstAngle) {
                        worstAngle = angle;
                        worstPos = posIndex;
                        worstOtherPos = otherPosIndex;
                    }
                }
            }
            if (worstAngle != null) { // This had better be true!
                // Remove the possible neighbor in both directions.
                faces[this.faceFromPosition(worstPos)].possibleNeighbors[this.edgeFromPosition(worstPos)].delete(worstOtherPos);
                faces[this.faceFromPosition(worstOtherPos)].possibleNeighbors[this.edgeFromPosition(worstOtherPos)].delete(worstPos);
                foundOne = true;
            }
        }

        // All done, now save the result.
        this.neighbors = [];
        // For each face, store to which island it belongs.  This is a
        // map from the island index (which is the root of the
        // union-find algorithm) to a list of faces.  Degenerate faces
        // are not included in any island.
        this.reverseIslands = [];
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            let islandIndex = findIsland(faceIndex);
            if (Number.isInteger(islandIndex)) {
                this.reverseIslands[faceIndex] = islandIndex;
            }
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let neighbor = faces[faceIndex].neighbors[edgeIndex];
                this.neighbors[faceIndex*3 + edgeIndex] = neighbor === null ? null : neighbor / 3;
            }
        }
    }

    // Returns a list of isolated BufferGeometries.
    isolatedBufferGeometries() {
        let geometries = [];
        let islands = new Map();
        for (let face = 0; face < this.reverseIslands.length; face++) {
            let root = this.reverseIslands[face];
            if (!Number.isInteger(root)) {
                continue;
            }
            if (!islands.has(root)) {
                islands.set(root, []);
            }
            islands.get(root).push(face);
        }
        for (let island of islands.values()) {
            let newGeometry = new THREE.BufferGeometry();

            let vertices = [];
            let normals = [];
            let colors = [];

            for (let faceIndex of island) {
                let posIndex = this.positionFromFace(faceIndex);
                for (var i = 0; i < 9; i++) {
                    vertices.push(this.positions[posIndex + i]);
                    if (this.colors) {
                        colors.push(this.colors[posIndex + i]);
                    }
                }
                let normal = this.faceNormal(faceIndex);
                for (let i = 0; i < 3; i++) {
                    normals.push(normal.x, normal.y, normal.z);
                }
            }

            newGeometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
            newGeometry.addAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
            if (this.colors) {
                newGeometry.addAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
            }
            geometries.push(newGeometry);
        }

        return geometries;
    }

    bufferGeometry() {
        let newGeometry = new THREE.BufferGeometry();
        let normals = [];
        for (let faceIndex = 0; faceIndex < this.positions / 9; faceIndex++) {
            let posIndex = this.positionFromFace(faceIndex);
            let normal = this.faceNormal(faceIndex);
            for (let i = 0; i < 3; i++) {
                normals.push(normal.x, normal.y, normal.z);
            }
        }
        newGeometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(this.positions), 3));
        newGeometry.addAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
        if (this.colors) {
            newGeometry.addAttribute('color', new THREE.BufferAttribute(new Float32Array(this.colors), 3));
        }
        return newGeometry;
    }

    // Returns all positions in the face, starting from the vertex specified.
    positionsFromFace(faceIndex, vertexIndex) {
        let p1 = this.positionFromFaceEdge(faceIndex, vertexIndex);
        let p2 = this.nextPositionInFace(p1);
        let p3 = this.nextPositionInFace(p2);
        return [p1, p2, p3];
    }

    // Gets all Vector3s for the positionList
    vector3sFromPositions(positionList, positions) {
        return positionList.map(p => this.vector3FromPosition(p, positions));
    }

    // Gets all Colors for the positionList
    colorsFromPositions(positionList, colors) {
        return positionList.map(p => this.colorFromPosition(p, colors));
    }

    getNeighborPosition(position) {
        return this.neighbors[position/3]*3;
    }

    // copy the x,y,z of the points into the array at the offset
    setPointsInArray(points, array, offset) {
        for (let p of points) {
            array[offset++] = p.x;
            array[offset++] = p.y;
            array[offset++] = p.z;
        }
    }

    // copy the x,y,z of the points into the array at the offset
    setColorsInArray(colors, array, offset) {
        for (let c of colors) {
            array[offset++] = c.r;
            array[offset++] = c.g;
            array[offset++] = c.b;
        }
    }

    // Returns the unit normal of a triangular face.
    faceNormal(faceIndex) {
        let [p0, p1, p2] =
            this.positionsFromFace(faceIndex, 0);
        return new THREE.Triangle(...this.vector3sFromPositions([p0, p1, p2], this.positions)).normal();
    }

    // Split all edges in this geometry so that there are no edges
    // that cross the plane.
    splitFaces(plane) {
        let positions = this.positions;
        let colors = this.colors;

        /* Given the face and edge index, split that edge at the point
           where it crosses the plane.

           If the edge doesn't cross the plane, do nothing.

           If the edge crosses the plane, split the face into two
           faces.  One face is modified in place, the other is added
           to the end of the faces array.  The neighboring face is
           adjusted and a new neighbor is made, too.  this.neighbors
           and this.islands are updated.
        */
        let splitFace = (faceIndex, edgeIndex, plane) => {
            let [position, nextPosition, previousPosition] =
                this.positionsFromFace(faceIndex, edgeIndex);
            let [edgeStart, edgeEnd, thirdVertex] =
                this.vector3sFromPositions([position, nextPosition, previousPosition],
                                           positions);

            let neighborPosition = this.getNeighborPosition(position);
            let neighborNextPosition = this.nextPositionInFace(neighborPosition);
            let neighborPreviousPosition = this.previousPositionInFace(neighborPosition);
            let [neighborEdgeStart, neighborEdgeEnd, neighborThirdVertex] =
                this.vector3sFromPositions([neighborPosition, neighborNextPosition, neighborPreviousPosition],
                                           positions);

            let edge = new THREE.Line3(edgeStart, edgeEnd);
            let intersectionPoint = plane.intersectLine(edge);
            if (intersectionPoint === undefined ||
                this.keyForVector3(intersectionPoint) == this.keyForVector3(edgeStart) ||
                this.keyForVector3(intersectionPoint) == this.keyForVector3(edgeEnd)) {
                return 0;
            }
            // The intersectionPoint replaces edgeEnd.
            this.setPointsInArray([intersectionPoint], positions, nextPosition);
            // A new face needs to be added for the other side of the triangle.
            this.setPointsInArray([intersectionPoint, edgeEnd, thirdVertex],
                                  positions, positions.length);
            // The intersectionPoint also replaces neighborEdgeEnd.
            this.setPointsInArray([intersectionPoint], positions, neighborNextPosition);
            // A new face needs to be added for the neighbor other side.
            this.setPointsInArray([intersectionPoint, neighborEdgeEnd, neighborThirdVertex],
                                  positions, positions.length);
            if (colors) {
                // The new face colors must be added.
                let alpha = edgeStart.distanceTo(intersectionPoint) / edgeStart.distanceTo(edgeEnd);
                let [startColor, endColor, thirdColor] =
                    this.colorsFromPositions([position, nextPosition, previousPosition],
                                             colors)
                let [neighborStartColor, neighborEndColor, neighborThirdColor] =
                    this.colorsFromPositions([neighborPosition, neighborNextPosition, neighborPreviousPosition],
                                             colors);
                let intersectionColor = startColor.clone().lerp(endColor, alpha);
                // The original face's colors must be adjusted.
                this.setColorsInArray([intersectionColor], colors, nextPosition);
                // New face colors need to be added.
                this.setColorsInArray([intersectionColor, endColor, thirdColor],
                                      colors, colors.length);
                // The original neighbor's face's colors must be adjusted.
                this.setColorsInArray([intersectionColor], colors, neighborNextPosition);
                // New face colors need to be added for neighbor.
                this.setColorsInArray([intersectionColor, neighborEndColor, neighborThirdColor],
                                      colors, colors.length);
            }
            // Add to this.neighbors
            let newNeighborIndex = this.neighbors.length;
            this.neighbors.push(neighborPosition/3,
                                this.neighbors[nextPosition/3],
                                nextPosition/3);
            this.neighbors.push(position/3,
                                this.neighbors[neighborNextPosition/3],
                                neighborNextPosition/3);
            // Make the above assignments symmetric.
            for (let i = newNeighborIndex; i < newNeighborIndex+6; i++) {
                this.neighbors[this.neighbors[i]] = i;
            }
            // Update the reverseIslands.
            this.reverseIslands[this.faceFromPosition(positions.length-18)] =
                this.reverseIslands[this.faceFromPosition(position)];
            this.reverseIslands[this.faceFromPosition(positions.length- 9)] =
                this.reverseIslands[this.faceFromPosition(neighborPosition)];
            return 1;
        }
        let splitsMade = 0;

        const faceCount = positions.length/9;
        for (let f = 0; f < faceCount; f++) {
            for (let e = 0; e < 3; e++) {
                splitsMade += splitFace(f, e, plane);
            }
        }
        return splitsMade;
    }

    debugLog(...args) {
        //console.log(...args);
    }
    // Merge faces where possible.
    //
    // Look for edges where one of the points could be moved to the
    // other point without affecting the shape.  Either:
    //
    // All the faces attached to the vertex to move are coplanar, so
    // it's a face in the middle of a flat spot, or:
    //
    // It's between two edges that are colinear and the two sides are
    // all coplanar faces.  It's a point in the middle of the shape's
    // edge.
    //
    // The faces that are merged out of existence are left in place as
    // degenerate faces.
    mergeFaces() {
        const faceCount = this.positions.length / 9;
        let facesMerged = 0;
        // must include
        let faces = [];
        //faces.push(200065);
        //faces.push(200066);
        //faces.push(200068);
        //faces.push(207300);
        //faces.push(204201);

        faces.push(165710);
        faces.push(165711);
        faces.push(165714);
        // 206562-206566
        //for (let faceIndex = 206566; faceIndex < 206567; faceIndex++)
        //{
            //faces.push(faceIndex);
        //}
        faces.push(206562);
        faces.push(206567);
        //for (let faceIndex of faces) {
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                //console.log("reverse island of " + faceIndex + " is " + this.reverseIslands[faceIndex]);
                if (!Number.isInteger(this.reverseIslands[faceIndex])) {
                    // This face is already a degenerate from previous
                    // merge operations but not yet deleted from
                    // this.positions .  Stop processing it.
                    // Eventually it will be removed from
                    // this.positions.
                    break;
                }
                let startPosition = this.positionFromFaceEdge(faceIndex, edgeIndex);
                let currentPosition = startPosition;
                let nextPosition = this.nextPositionInFace(currentPosition);
                if (this.keyForTrio(startPosition) == this.keyForTrio(nextPosition)) {
                    this.debugLog("no need");
                    this.debugLog(this.keyForTrio(startPosition));
                    // No need to continue because this already 0 length.
                    continue;
                }
                let currentNormal = this.faceNormal(this.faceFromPosition(startPosition));
                let normalsCount = 1;
                let start = this.vector3FromPosition(startPosition, this.positions);
                let next = this.vector3FromPosition(nextPosition, this.positions);
                this.debugLog("merging");
                this.debugLog(start);
                this.debugLog(next);
                do {
                    this.debugLog("current normal is " + this.keyForVector3(currentNormal));
                    currentPosition = this.getNeighborPosition(nextPosition);
                    nextPosition = this.nextPositionInFace(currentPosition);
                    let currentThird = this.nextPositionInFace(nextPosition);
                    this.debugLog("current third is: ");
                    this.debugLog(this.vector3FromPosition(currentThird, this.positions));
                    let neighborNormal = this.faceNormal(this.faceFromPosition(currentPosition));
                    if (neighborNormal.length() == 0) {
                        this.debugLog("ignore degenerate");
                        // Ignore the normal of degenerate faces.
                        continue;
                    }
                    if (this.keyForVector3(currentNormal, 3) == this.keyForVector3(neighborNormal, 3)) {
                        this.debugLog("same normal");
                        // Same normal so it's coplanar so we can ignore it.
                        continue;
                    }
                    this.debugLog("new normal is: " + this.keyForVector3(neighborNormal));
                    // The new face has a different normal.  This point might be on an edge.
                    let current = this.vector3FromPosition(currentPosition, this.positions);
                    // New normal.
                    if (this.keyForVector3(new THREE.Line3(start, next).delta().normalize(), 3) ==
                        this.keyForVector3(new THREE.Line3(next, current).delta().normalize(), 3) &&
                        normalsCount < 2) {
                        // This is the second side of the edge and the edge is a line.
                        // New normal after a colinear edge so it's okay.
                        currentNormal = neighborNormal;
                        normalsCount++;
                    } else {
                        // This point touches 3 different planes so it can't be collapsed.
                        break;
                    }
                } while (currentPosition != startPosition);
                if (currentPosition == startPosition) {
                    //console.log("collapse " + faceIndex);
                    this.debugLog(start);
                    this.debugLog(next);
                    // We didn't break so this triangle should be collapsable.
                    facesMerged++;
                    let faces = [];
                    do {
                        let nextPosition = this.nextPositionInFace(currentPosition);
                        this.setPointsInArray([start], this.positions, nextPosition);
                        faces.push(this.faceFromPosition(currentPosition));
                        currentPosition = this.getNeighborPosition(nextPosition);
                    } while (currentPosition != startPosition);
                    this.removeDegenerates0(faces);
                    this.removeDegenerates180(faces);
                }
            }
        }
        return facesMerged;
    }

    // Remove degenerates where two of 3 vertices are the same.
    removeDegenerates0(faces) {
        for (let faceIndex of faces) {
            // Find if there are two identical vertices.
            let edgeIndex = 0;
            for (; edgeIndex < 3; edgeIndex++) {
                let position = this.positionFromFaceEdge(faceIndex, edgeIndex);
                let nextPosition = this.nextPositionInFace(position);
                if (this.keyForTrio(position) == this.keyForTrio(nextPosition)) {
                    // Found a degenerate.
                    let edge1 = nextPosition;
                    let edge2 = this.nextPositionInFace(edge1);
                    // Connect their neighbors.
                    if (Number.isInteger(this.neighbors[edge1/3]) &&
                        Number.isInteger(this.neighbors[edge2/3])) {
                        this.neighbors[this.neighbors[edge1/3]] = this.neighbors[edge2/3];
                        this.neighbors[this.neighbors[edge2/3]] = this.neighbors[edge1/3];
                    }
                    this.reverseIslands[faceIndex] = null;
                }
            }
        }
    }

    // Remove degenerates where two faces share more than one edge but not all 3 edges.
    removeDegenerates180(faces) {
        for (let faceIndex of faces) {
            // Find if there is a face that is connected exactly twice.
            let edgeIndex = 0;
            for (; edgeIndex < 3; edgeIndex++) {
                let position = this.positionFromFaceEdge(faceIndex, edgeIndex);
                let nextPosition = this.nextPositionInFace(position);
                let previousPosition = this.previousPositionInFace(position);
                if (this.faceFromPosition(this.getNeighborPosition(position)) ==
                    this.faceFromPosition(this.getNeighborPosition(nextPosition)) &&
                    this.faceFromPosition(this.getNeighborPosition(position)) !=
                    this.faceFromPosition(this.getNeighborPosition(previousPosition))) {
                    // Found a degenerate.
                    let otherFaceIndex = this.faceFromPosition(this.getNeighborPosition(position));
                    let edge1 = this.nextPositionInFace(nextPosition);
                    let edge2 = this.nextPositionInFace(this.getNeighborPosition(position));
                    // Connect their neighbors.
                    if (Number.isInteger(this.neighbors[edge1/3]) &&
                        Number.isInteger(this.neighbors[edge2/3])) {
                        this.neighbors[this.neighbors[edge1/3]] = this.neighbors[edge2/3];
                        this.neighbors[this.neighbors[edge2/3]] = this.neighbors[edge1/3];
                    }
                    this.reverseIslands[faceIndex] = null;
                    this.reverseIslands[otherFaceIndex] = null;
                }
            }
        }
    }

    // Rewrite the list of faces without the degenerates in it.
    deleteDegenerates() {
        const faceCount = this.positions.length / 9;

        let degeneratesRemoved = 0;
        let newPositions = [];
        let newColors = [];
        let newFaceIndex = [];
        let newReverseIslands = [];
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            if (!Number.isInteger(this.reverseIslands[faceIndex])) {
                // Degenerate not part of any island.
                degeneratesRemoved++;
                continue;
            }
            newPositions.push(...this.positions.slice(faceIndex*9, (faceIndex+1)*9));
            if (this.colors) {
                newColors.push(...this.colors.slice(faceIndex*9, (faceIndex+1)*9));
            }
            newReverseIslands.push(this.reverseIslands[faceIndex]);
            newFaceIndex[faceIndex] = faceIndex - degeneratesRemoved;
        }
        let newNeighbors = [];
        for (let oldFaceIndex = 0; oldFaceIndex < faceCount; oldFaceIndex++) {
            for (let oldEdgeIndex = 0; oldEdgeIndex < 3; oldEdgeIndex++) {
                if (!Number.isInteger(newFaceIndex[oldFaceIndex])) {
                    continue;
                }
                let oldPosition = this.positionFromFaceEdge(oldFaceIndex, oldEdgeIndex);
                let oldNeighborPosition = this.getNeighborPosition(oldPosition);
                let newPosition = this.positionFromFaceEdge(newFaceIndex[oldFaceIndex],
                                                            oldEdgeIndex);
                let newNeighborPosition = this.positionFromFaceEdge(newFaceIndex[this.faceFromPosition(oldNeighborPosition)],
                                                                    this.edgeFromPosition(oldNeighborPosition));
                newNeighbors[newPosition/3] = newNeighborPosition/3;
            }
        }

        this.positions = newPositions;
        if (this.colors) {
            this.colors = newColors;
        }
        this.neighbors = newNeighbors;
        this.reverseIslands = newReverseIslands;
        return degeneratesRemoved;
    }
}

export { ConnectedBufferGeometry };
