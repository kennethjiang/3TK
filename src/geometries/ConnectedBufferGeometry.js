import * as THREE from 'three';

// A ConnectedBufferGeometry is a BufferGeometry with additional
// neighbor information.  The neighbor information maintains which
// face is connected to which face by which edge.
class ConnectedBufferGeometry extends THREE.BufferGeometry {
    constructor(...args) {
        super(...args);
        // neighbors has length the same as faces*3.  Each element is
        // the position of the neighboring faceEdge.
        this.neighbors = [];
        this.islands = [];
    }

    fromBufferGeometry(bufferGeometry) {
        let ret = this.copy(bufferGeometry);
        this.findNeighbors();
        return ret;
    }

    clone(...args) {
        let cbg = super.clone(...args);
        cbg.neighbors = this.neighbors.slice(0);
        cbg.islands = this.islands.slice(0);
    }

    merge(...args) {
        let ret = super.merge(...args);
        this.findNeighbors();
        return ret;
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

    keyForVector3(vector3, precisionPoints = 4) {
        let [v1, v2, v3] = [vector3.x, vector3.y, vector3.z];
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
        positions = positions || this.getAttribute('position').array;
        return new THREE.Vector3().fromArray(positions, position);
    }
    // Given index in originalPositions, return a Vector3 of that point.
    colorFromPosition(position, colors) {
        colors = colors || this.getAttribute('color').array;
        return new THREE.Color().fromArray(colors, position);
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

    // Recalculate the neighbors.
    // this.neighbors will be an array with length 3 times the number of faces.
    // Each element is the connection between
    findNeighbors() {
        let originalPositions = this.getAttribute('position').array;
        let precisionPoints = 4;
        var vertexPosMap = this.vertexPositionMap(precisionPoints);

        const faceCount = originalPositions.length / 9;

        // Returns true if the faceIndex (0 to faceCount-1) has two
        // identical points in it.
        let isFaceDegenerate = (faceIndex) => {
            let facePoints = new Set();
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                facePoints.add(this.keyForTrio(this.positionFromFaceEdge(faceIndex, edgeIndex), precisionPoints));
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
                let posIndex = this.positionFromFaceEdge(faceIndex, edgeIndex);
                let key = this.keyForTrio(posIndex, precisionPoints);
                let keyNext = this.keyForTrio(this.nextPositionInFace(posIndex), precisionPoints);
                for (let newPosIndex of vertexPosMap.get(key)) {
                    // A face is only neighboring if the edges are in
                    // common and point in opposite directions.
                    let newKeyPrevious = this.keyForTrio(this.previousPositionInFace(newPosIndex), precisionPoints);
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
            let commonPoint1 = this.vector3FromPosition(posIndex1);
            let commonPoint2 = this.vector3FromPosition(this.nextPositionInFace(posIndex1));
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
            let worstAngle = -Infinity;
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
        this.islands = new Map();
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            let islandIndex = findIsland(faceIndex);
            if (islandIndex !== null) {
                if (this.islands.get(islandIndex) === undefined) {
                    // Haven't seen this island yet so add a new face list.
                    this.islands.set(islandIndex, []);
                }
                this.islands.get(islandIndex).push(faceIndex);
            }
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let neighbor = faces[faceIndex].neighbors[edgeIndex];
                this.neighbors[faceIndex*3 + edgeIndex] = neighbor === null ? null : neighbor / 3;
            }
        }
    }

    // Returns a list of isolated BufferGeometries.
    isolatedBufferGeometries() {
        let originalPositions = this.getAttribute('position').array;
        let originalNormals = this.getAttribute('normal') !== undefined ? this.getAttribute('normal').array : undefined;
        let originalColors = this.getAttribute('color') !== undefined ? this.getAttribute('color').array : undefined;
        let geometries = [];
        for (let island of this.islands.values()) {
            let newGeometry = new THREE.BufferGeometry();

            let vertices = [];
            let normals = [];
            let colors = [];

            for (let faceIndex of island) {
                let posIndex = this.positionFromFace(faceIndex);
                for (var i = 0; i < 9; i++) {
                    vertices.push(originalPositions[posIndex + i]);
                    if (originalNormals) {
                        normals.push(originalNormals[posIndex + i]);
                    }
                    if (originalColors) {
                        colors.push(originalColors[posIndex + i]);
                    }
                }
            }

            newGeometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array( vertices ), 3));
            if (originalNormals) {
                newGeometry.addAttribute('normal', new THREE.BufferAttribute(new Float32Array( normals ), 3));
            }
            if (originalColors) {
                newGeometry.addAttribute( 'color', new THREE.BufferAttribute(new Float32Array( colors ), 3));
            }
            geometries.push(newGeometry);
        }

        return geometries;
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
        return new THREE.Triangle(...this.vector3sFromPositions([p0, p1, p2])).normal();
    }

    // Split all edges in this geometry so that there are no edges
    // that cross the plane.
    splitFaces(plane) {
        let positions = Array.from(this.getAttribute('position').array);
        let normals = this.getAttribute('normal') &&  Array.from(this.getAttribute('normal').array);
        let colors = this.getAttribute('color') && Array.from(this.getAttribute('color').array);
        let reverseIslands = new Map();
        for (let [root, faces] of this.islands) {
            for (let face of faces) {
                reverseIslands.set(face, root);
            }
        }
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
                return;
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
            if (normals) {
                // The new face's normals must be added.
                let alpha = edgeStart.distanceTo(intersectionPoint) / edgeStart.distanceTo(edgeEnd);
                let [startNormal, endNormal, thirdNormal] =
                    this.vector3sFromPositions([position, nextPosition, previousPosition],
                                               normals);
                let [neighborStartNormal, neighborEndNormal, neighborThirdNormal] =
                    this.vector3sFromPositions([neighborPosition, neighborNextPosition, neighborPreviousPosition],
                                               normals);
                let intersectionNormal = startNormal.clone().lerp(endNormal, alpha).normalize();
                // The original face's normals must be adjusted.
                this.setPointsInArray([intersectionNormal], normals, nextPosition);
                // New normals needs to be added.
                this.setPointsInArray([intersectionNormal, endNormal, thirdNormal],
                                        normals, normals.length);
                // The original neighbor's face's normals must be adjusted.
                this.setPointsInArray([intersectionNormal], normals, neighborNextPosition);
                // New normals need to be added for neighbor.
                this.setPointsInArray([intersectionNormal, neighborEndNormal, neighborThirdNormal],
                                        normals, normals.length);
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
            // Update the islands.
            this.islands.get(reverseIslands.get(this.faceFromPosition(position))).push(
                this.faceFromPosition(positions.length-18));
            this.islands.get(reverseIslands.get(this.faceFromPosition(neighborPosition))).push(
                this.faceFromPosition(positions.length-9));
            // Update the reverseIslands.
            reverseIslands.set(this.faceFromPosition(positions.length-18),
                               reverseIslands.get(this.faceFromPosition(position)));
            reverseIslands.set(this.faceFromPosition(positions.length- 9),
                               reverseIslands.get(this.faceFromPosition(neighborPosition)));
        }
        for (let f = 0; f < positions.length/9; f++) {
            for (let e = 0; e < 3; e++) {
                splitFace(f, e, plane);
            }
        }
        // Now rewrite the attributes.
        this.getAttribute("position").setArray(new Float32Array(positions), 3);
        this.getAttribute("position").needsUpdate = true;
        if (normals) {
            this.getAttribute("normal").setArray(new Float32Array(normals), 3);
            this.getAttribute("normal").needsUpdate = true;
        }
        if (colors) {
            this.getAttribute("color").setArray(new Float32Array(colors), 3);
            this.getAttribute("color").needsUpdate = true;
        }
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
    /*mergeFaces() {
        const faceCount = originalPositions.length / 9;
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let [position, nextPosition, previousPosition] =
                    this.positionsFromFace(faceIndex, edgeIndex);
                let startPosition = position;
                let [edgeStart, edgeEnd, thirdVertex] =
                    this.vector3sFromPositions([position, nextPosition, previousPosition],
                                               positions);
                let normal = 
                let neighborPosition = getNeighborPosition(edgeEnd)
                
            }
        }
    }*/
}

export { ConnectedBufferGeometry };
