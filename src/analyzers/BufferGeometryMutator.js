import * as THREE from 'three';

// A BufferGeometryMutator is similar to a BufferGeometry with
// additional neighbor information.  The neighbor information
// maintains which face is connected to which face by which edge.
class BufferGeometryMutator {
    constructor() {
        // An array of numbers.  Every triple represents a point.
        // Every 3 points is a face.
        this.positions = [];
        // An array of numbers.  Every triple represents the RGB of a
        // vertex.  If it's undefined, that means that the input
        // BufferGeometry didn't have any colors.
        this.colors = undefined;
        // neighbors has length the same as faces*3.  Each element is
        // the position of the neighboring faceEdge.
        this.neighbors = [];
        // A list as long as the number of faces.  Each element is a
        // number that identifies an island.  All faces that have the
        // same island number are part of the same shape.  faces that
        // have null island are degenerate and not part of any shape.
        this.reverseIslands = [];

        // static variables needed temporarily for methods below.
        this.faceNormalVector3s = [new THREE.Vector3(),
                                   new THREE.Vector3(),
                                   new THREE.Vector3()];
        this.faceNormalTriangle = new THREE.Triangle();
        this.vertexLeft = new THREE.Vector3();
        this.vertexMiddle = new THREE.Vector3();
        this.vertexRight = new THREE.Vector3();
    }

    clone() {
        let newBufferGeometryMutator = new BufferGeometryMutator();
        newBufferGeometryMutator.positions = this.positions.slice(0);
        if (this.colors) {
            newBufferGeometryMutator.colors = this.colors.slice(0);
        }
        newBufferGeometryMutator.neighbors = this.neighbors.slice(0);
        newBufferGeometryMutator.reverseIslands = this.reverseIslands.slice(0);
        return newBufferGeometryMutator;
    }

    range(x) {
        // eslint should allow Symbol
        /* global Symbol */
        return {[Symbol.iterator]:
                function* () {
                    for (let i = 0; i < x; i++) {
                        yield i;
                    }
                }};
    }

    // Uses only the positions from a THREE.BufferGeometry.
    fromBufferGeometry(bufferGeometry) {
        this.positions = Array.from(bufferGeometry.getAttribute('position').array);
        if (bufferGeometry.getAttribute('color')) {
            this.colors = Array.from(bufferGeometry.getAttribute('color').array);
        } else {
            this.colors = undefined;
        }
        if (!this.findNeighbors()) {
            return null;
        }
        return this;
    }

    // Convert 3 consecutive positions into a string usable as a key in a Map.
    keyForTrio(startIndex) {
        let array = this.positions;
        let [v1, v2, v3] = [array[startIndex], array[startIndex+1], array[startIndex+2]];
        return v1 + '_' + v2 + '_' + v3;
    }

    // Convert 3 consecutive positions into a value usable as a key in
    // a Map.  This doesn't need to be a strong hash, but it needs to
    // be fast.
    hashForTrio(startIndex) {
        let array = this.positions;
        let [v1, v2, v3] = [array[startIndex], array[startIndex+1], array[startIndex+2]];
        return v1 + v2 + + v3;
    }

    // Returns a Map of keyForTrio to positions in this.positions.
    vertexPositionMap() {
        let map = new Map();
        for (var posIndex = 0; posIndex < this.positions.length; posIndex += 3) {
            let key = this.hashForTrio(posIndex);
            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key).push(posIndex);
        }
        return map;
    }

    // Given a faceIndex (0 to faceCount-1), return an index in this.positions.
    positionFromFace(faceIndex) {
        return faceIndex*9;
    }

    // Given an index in this.positions, return the face (0 to facecount-1).
    faceFromPosition(positionIndex) {
        return Math.floor(positionIndex/9);
    }
    // Given an index in this.positions, return the edge in the face (0 to 2).
    edgeFromPosition(positionIndex) {
        return (positionIndex % 9) / 3;
    }
    // Given a faceIndex (0 to faceCount-1) and edgeIndex (0 to 2), return index in this.positions.
    positionFromFaceEdge(faceIndex, edgeIndex) {
        return this.positionFromFace(faceIndex) + 3*edgeIndex;
    }
    // Given index in this.positions, return a THREE.Vector3 of that
    // point.  Re-use the provided vector3 if there is one.
    vector3FromPosition(position, vector3) {
        vector3 = vector3 || new THREE.Vector3();
        return vector3.fromArray(this.positions, position);
    }
    // Given index in this.positions, return a THREE.Color of that
    // point.  Re-use the provided Color if there is one.
    colorFromPosition(position, color) {
        if (!this.colors) {
            return this.colors;
        }
        color = color || new THREE.Color();
        return color.fromArray(this.colors, position);
    }

    // Gets the position of an adjacent vertex in the face.  If
    // direction is +3, go forward.  If -3, go to previous.
    otherPositionInFace(posIndex, direction) {
        let faceDifference = this.faceFromPosition(posIndex + direction) - this.faceFromPosition(posIndex);
        return posIndex + direction - this.positionFromFace(faceDifference);
    }
    // Gets the next position in the face, which is the next point
    // unless we're at the end and then it's the first point.
    nextPositionInFace(posIndex) {
        return this.otherPositionInFace(posIndex, 3);
    }
    // Gets the previous position in the face, which is the previous
    // point unless we're at the start and then it's the last point.
    previousPositionInFace(posIndex) {
        return this.otherPositionInFace(posIndex, -3);
    }

    // Returns true if the x,y,z coordinates at pos1 match those at
    // pos2.
    equalTrios(pos1, pos2) {
        return (this.positions[pos1  ] == this.positions[pos2  ] &&
                this.positions[pos1+1] == this.positions[pos2+1] &&
                this.positions[pos1+2] == this.positions[pos2+2]);
    }

    // Returns true if the faceIndex (0 to faceCount-1) has two
    // identical points in it.
    isFaceDegenerate(faceIndex) {
        for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
            let currentPos = this.positionFromFaceEdge(faceIndex, edgeIndex);
            let nextPos = this.nextPositionInFace(currentPos);
            if (this.equalTrios(currentPos, nextPos)) {
                return true;
            }
        }
        return false;
    }

    // Recalculate the neighbors.
    // this.neighbors will be an array with length 3 times the number of faces.
    // this.reverseIslands will be an array with length equal to the number of faces.
    findNeighbors() {
        let vertexPosMap = this.vertexPositionMap();
        const faceCount = this.positions.length / 9;

        // Find the island to which this face belongs using the
        // union-join algorithm.
        let findIsland = function (faceIndex) {
            if (faces[faceIndex].island != null && faces[faceIndex].island != faceIndex) {
                faces[faceIndex].island = findIsland(faces[faceIndex].island);
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
                let key = this.hashForTrio(posIndex);
                let nextPosition = this.nextPositionInFace(posIndex);
                for (let newPosIndex of vertexPosMap.get(key)) {
                    if (!this.equalTrios(newPosIndex, posIndex)) {
                        continue;
                    }
                    // A face is only neighboring if the edges are in
                    // common and point in opposite directions.
                    let newPreviousPosition = this.previousPositionInFace(newPosIndex);
                    if (!this.equalTrios(nextPosition, newPreviousPosition)) {
                        continue;
                    }
                    // This neighboring face is connected.
                    // We'll ignore degenerate triangles.
                    if (faces[this.faceFromPosition(newPosIndex)].degenerate) {
                        continue;
                    }
                    // We're able to connect to the edge key and
                    // previous, which is the previous edge.
                    faces[faceIndex].possibleNeighbors[edgeIndex].set(newPreviousPosition, null);
                }
                unconnectedEdges.add(posIndex);
            }
        }
        // Returns the angle between faces 0 to 2pi.
        // A smaller angle indicates less enclosed space.
        // Assumes that the common edge is posIndex1 to posIndex1+3 and
        // posIndex2 to posIndex2-3.
        let facesAngle = (() => {
            let normal1 = new THREE.Vector3();
            let normal2 = new THREE.Vector3();
            let commonPoint1 = new THREE.Vector3();
            let commonPoint2 = new THREE.Vector3();
            return (posIndex1, posIndex2) => {
                normal1 = this.faceNormal(this.faceFromPosition(posIndex1), normal1);
                normal2 = this.faceNormal(this.faceFromPosition(posIndex2), normal2);
                commonPoint1 = this.vector3FromPosition(posIndex1, commonPoint1);
                commonPoint2 = this.vector3FromPosition(this.nextPositionInFace(posIndex1), commonPoint2);
                commonPoint2.sub(commonPoint1); // commonPoint2 is now edge1.
                let normalsAngle = normal1.angleTo(normal2); // Between 0 and pi.
                let facesAngle = Math.PI;
                if (normal1.cross(normal2).dot(commonPoint2) > 0) {
                    facesAngle -= normalsAngle;
                } else {
                    facesAngle += normalsAngle;
                }
                return facesAngle;
            }
        })();

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

            joinIslands(this.faceFromPosition(posIndex1), this.faceFromPosition(posIndex2));
            // Finally, remove from the set of edges that still need to be resolved.
            unconnectedEdges.delete(posIndex1);
            unconnectedEdges.delete(posIndex2);
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
            // Try to join edges that are already part of the same
            // shape.  This makes for shapes that are smaller and
            // better split.
            for (let posIndex of unconnectedEdges) {
                let faceIndex = this.faceFromPosition(posIndex);
                let edgeIndex = this.edgeFromPosition(posIndex);
                if (faces[faceIndex].neighbors[edgeIndex] == null) {
                    let currentIsland = findIsland(faceIndex);
                    for (let possibleNeighbor of faces[faceIndex].possibleNeighbors[edgeIndex].keys()) {
                        if (findIsland(this.faceFromPosition(possibleNeighbor)) ==
                            currentIsland) {
                            connectEdge(this.positionFromFaceEdge(faceIndex, edgeIndex),
                                        possibleNeighbor);
                            foundOne = true;
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
            if (worstAngle === null) {
                // Couldn't find all neighbors.  Maybe the shape is non-manifold?
                break;
            }
            // Remove the possible neighbor in both directions.
            faces[this.faceFromPosition(worstPos)].possibleNeighbors[this.edgeFromPosition(worstPos)].delete(worstOtherPos);
            faces[this.faceFromPosition(worstOtherPos)].possibleNeighbors[this.edgeFromPosition(worstOtherPos)].delete(worstPos);
            foundOne = true;
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
                this.neighbors[faceIndex*3 + edgeIndex] = (!Number.isInteger(neighbor) ? neighbor : neighbor / 3);
            }
        }
        return true;
    }

    // Yield BufferGeometryMutators, one per island.
    *isolate() {
        let seenIslands = new Set();
        let foundOne = false;
        for (let face = 0; face < this.reverseIslands.length; face++) {
            let island = this.reverseIslands[face];
            if (!Number.isInteger(island)) {
                continue;
            }
            seenIslands.add(island);
        }
        let islands = Array.from(seenIslands);
        for (let islandIndex = 0; islandIndex < islands.length; islandIndex++) {
            // Add a new clone.
            let newBufferGeometryMutator = this.clone();
            for (let faceIndex = 0; faceIndex < this.positions.length/9; faceIndex++) {
                let island = newBufferGeometryMutator.reverseIslands[faceIndex];
                if (Number.isInteger(island) && island != islands[islandIndex]) {
                    newBufferGeometryMutator.reverseIslands[faceIndex] = null; // Mark for deletion.
                }
            }
            newBufferGeometryMutator.deleteDegenerates();
            yield newBufferGeometryMutator;
        }
    }

    // Whereas isolate() returns BufferGeometryMutators, this returns
    // BufferGeometries.  This runs faster than doing isolate() and
    // then bufferGeometry() on each.
    isolatedBufferGeometries() {
        // Map from island id to BufferGeometry.
        let seenIslands = new Map();
        let foundOne = false;
        let normal = new THREE.Vector3();
        for (let face = 0; face < this.reverseIslands.length; face++) {
            let island = this.reverseIslands[face];
            if (!Number.isInteger(island)) {
                continue;
            }
            if (!seenIslands.has(island)) {
                seenIslands.set(island, [[], [], []]);
            }
            let [positions, colors, normals] = seenIslands.get(island);
            let position = this.positionFromFace(face);
            for (let offset = 0; offset < 9; offset++) {
                positions.push(this.positions[position+offset]);
            }
            if (this.colors) {
                for (let offset = 0; offset < 9; offset++) {
                    colors.push(this.colors[position+offset]);
                }
            }
            normal = this.faceNormal(face, normal);
            for (let i = 0; i < 3; i++) {
                normals.push(normal.x, normal.y, normal.z);
            }
        }
        let newBufferGeometries = [];
        for (let [positions, colors, normals] of seenIslands.values()) {
            let newGeometry = new THREE.BufferGeometry();
            newGeometry.addAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            if (this.colors) {
                newGeometry.addAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            }
            newGeometry.addAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            newBufferGeometries.push(newGeometry);
        }
        return newBufferGeometries;
    }

    bufferGeometry() {
        let newGeometry = new THREE.BufferGeometry();
        let normals = [];
        let normal = new THREE.Vector3();
        for (let faceIndex = 0; faceIndex < this.positions.length / 9; faceIndex++) {
            normal = this.faceNormal(faceIndex, normal);
            for (let i = 0; i < 3; i++) {
                normals.push(normal.x, normal.y, normal.z);
            }
        }
        newGeometry.addAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        if (this.colors) {
            newGeometry.addAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
        }
        newGeometry.addAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        return newGeometry;
    }

    // round vertices to the nearest Float32 value.  This eliminates
    // degenerates when saving the file.
    roundToFloat32() {
        // First round all vertices to floats.
        this.positions = Array.from(new Float32Array(this.positions));
        // Remove all degenerate triangles where the normal is 0 when rounded to float.
        this.removeDegenerates(this.range(this.positions.length/9));
        // Remove all the triangles that aren't part of any shapes anymore.
        this.deleteDegenerates();
    }

    // Returns all positions in the face, starting from the vertex specified.
    positionsFromFace(faceIndex, vertexIndex = 0) {
        let p1 = this.positionFromFaceEdge(faceIndex, vertexIndex);
        let p2 = this.nextPositionInFace(p1);
        let p3 = this.nextPositionInFace(p2);
        return [p1, p2, p3];
    }

    // Gets all Vector3s for the positionList.  Use the vector3s in
    // the list if provided.
    vector3sFromPositions(positionList, vector3List = []) {
        let ret = [];
        for (let i = 0; i < positionList.length; i++) {
            ret.push(this.vector3FromPosition(positionList[i], vector3List[i]));
        }
        return ret;
    }

    // Gets all Colors for the positionList.  Use the colors in the
    // list if provided.  If this.colors is not defined, return
    // undefined.
    colorsFromPositions(positionList, colorList = []) {
        if (!this.colors) {
            return this.colors;
        }
        let ret = [];
        for (let i = 0; i < positionList.length; i++) {
            ret.push(this.colorFromPosition(positionList[i], colorList[i]));
        }
        return ret;
    }

    // Returns the neighbor edge position of a position.
    getNeighborPosition(position) {
        if (Number.isInteger(this.neighbors[position/3])) {
            return this.neighbors[position/3]*3;
        } else {
            return this.neighbors[position/3];
        }
    }

    // copy the x,y,z of the points into the array at the offset
    setPositions(points, offset) {
        for (let p of points) {
            this.positions[offset++] = p.x;
            this.positions[offset++] = p.y;
            this.positions[offset++] = p.z;
        }
    }

    // copy the r,g,b of the colors into the array at the offset
    setColors(colors, offset) {
        for (let c of colors) {
            this.colors[offset++] = c.r;
            this.colors[offset++] = c.g;
            this.colors[offset++] = c.b;
        }
    }

    faceNormalFromPositions(positions, target) {
        target = target || new THREE.Vector3();
        return this.faceNormalTriangle.set(...this.vector3sFromPositions(positions, this.faceNormalVector3s)).normal(target);
    }

    // Returns the unit normal of a triangular face.
    faceNormal(faceIndex, target) {
        target = target || new THREE.Vector3();
        return this.faceNormalFromPositions(this.positionsFromFace(faceIndex), target);
    }

    // Split all edges in this geometry so that there are no edges
    // that cross the plane.
    splitFaces(plane) {
        // Maintain a list of coordinates that intersect the plane.
        // Each position is on the plane for the purpose of collapsing
        // later.
        let splitPositions = new Set();
        // 2D array, element 0 is for current face, element 1 for neighbor if there is one.
        let vertices = [[new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
                        [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]];
        // 2D array, element 0 is for current face, element 1 for neighbor if there is one.
        let colors =  [[new THREE.Color(), new THREE.Color(), new THREE.Color()],
                       [new THREE.Color(), new THREE.Color(), new THREE.Color()]];
        let intersectionPoint = new THREE.Vector3();
        let intersectionColor = new THREE.Color();
        let line = new THREE.Line3();
        const faceCount = this.positions.length/9;
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            for (let edgeIndex= 0; edgeIndex < 3; edgeIndex++) {
                /* If the edge doesn't cross the plane, do nothing.

                   If the edge crosses the plane, split the face into
                   two faces.  One face is modified in place, the
                   other is added to the end of the faces array.  The
                   faces that are added to the end are the ones that
                   don't require more splitting.  The neighboring face
                   is adjusted and a new neighbor is made, too.
                   this.neighbors and this.islands are updated.
                */
                let positions = []; // 2D array, element 0 is for current face, element 1 for neighbor.
                positions[0] = this.positionsFromFace(faceIndex, edgeIndex);
                if (splitPositions.has(this.keyForTrio(positions[0][0])) ||
                    splitPositions.has(this.keyForTrio(positions[0][1]))) {
                    // One of the end ponts is already split so there's no
                    // need to split here.  This saves us from creating
                    // degenerate triangles when the interseciton
                    // calculation isn't an exact value.
                    continue;
                }
                if (Number.isInteger(this.getNeighborPosition(positions[0][0]))) {
                    // Only if there is a neighbor.
                    positions[1] = [this.getNeighborPosition(positions[0][0])];
                    positions[1].push(this.nextPositionInFace(positions[1][0]),
                                      this.previousPositionInFace(positions[1][0]));
                }
                for (let i = 0; i < positions.length; i++) {
                    vertices[i] = this.vector3sFromPositions(positions[i], vertices[i]);
                    colors[i] = this.colorsFromPositions(positions[i], colors[i]);
                }

                // We only use plane.distanceTo so that the result is
                // consistent for later steps.  If we used
                // intersectLine, there might be rounding issues that
                // would confuse the algorithm.
                let distances = [plane.distanceToPoint(vertices[0][0]),
                                 plane.distanceToPoint(vertices[0][1])];
                if (distances[0] == 0) {
                    splitPositions.add(this.keyForTrio(positions[0][0]));
                }
                if (distances[1] == 0) {
                    splitPositions.add(this.keyForTrio(positions[0][1]));
                }
                if (distances[0] == 0 ||
                    distances[1] == 0 ||
                    distances[0] < 0 && distances[1] < 0 ||
                    distances[0] > 0 && distances[1] > 0) {
                    // Either one of the end points is already an
                    // intersection or both are on the same side of
                    // the plane.
                    continue;
                }
                // By this point, neither is 0 and one is greater than
                // 0 and one is less than 0.
                let alpha = distances[0]/(distances[0]-distances[1]);
                intersectionPoint.copy(vertices[0][0]).lerp(vertices[0][1], alpha);
                if (this.colors) {
                    intersectionColor.copy(colors[0][0]).lerp(colors[0][1], alpha);
                }

                let vertexToMove = [];
                for (let i = 0; i < positions.length; i++) {
                    let secondIntersectionPoint = plane.intersectLine(line.set(vertices[i][0], vertices[i][2]));
                    // Which vertex needs to be moved to the intersection
                    // so that the new face created won't need further
                    // splitting?
                    if (secondIntersectionPoint === undefined ||
                        secondIntersectionPoint.equals(vertices[i][0]) ||
                        secondIntersectionPoint.equals(vertices[i][2])) {
                        // No intersection with plane from position 0 to
                        // position 2, so let that be part of the new face.
                        vertexToMove[i] = 0;
                    } else {
                        vertexToMove[i] = 1;
                    }
                }

                for (let i = 0; i < positions.length; i++) {
                    // The intersectionPoint replaces the vertex from above.
                    this.setPositions([intersectionPoint], positions[i][vertexToMove[i]]);
                    if (this.colors) {
                        // The intersectionColor replaces the color from above.
                        this.setColors([intersectionColor], positions[i][vertexToMove[i]]);
                    }
                    splitPositions.add(this.keyForTrio(positions[i][vertexToMove[i]]));
                    // A new face needs to be added for the other side of the triangle.
                    if (vertexToMove[i] == 0) {
                        this.setPositions([vertices[i][2], vertices[i][0], intersectionPoint],
                                          this.positions.length);
                        if (this.colors) {
                            this.setColors([colors[i][2], colors[i][0], intersectionColor],
                                           this.colors.length);
                        }
                    } else {
                        this.setPositions([intersectionPoint, vertices[i][1], vertices[i][2]],
                                          this.positions.length);
                        if (this.colors) {
                            this.setColors([intersectionColor, colors[i][1], colors[i][2]],
                                           this.colors.length);
                        }
                    }
                }

                // Add to this.neighbors
                let newNeighborIndex = this.neighbors.length;
                if (vertexToMove.length == 1 && vertexToMove[0] == 1) {
                    this.neighbors.push(null,
                                        this.neighbors[positions[0][1]/3],
                                        positions[0][1]/3);
                } else if (vertexToMove.length == 1 && vertexToMove[0] == 0) {
                    this.neighbors.push(this.neighbors[positions[0][2]/3],
                                        null,
                                        positions[0][2]/3);
                } else if (vertexToMove[0] == 1 && vertexToMove[1] == 1) {
                    this.neighbors.push(positions[1][0]/3,
                                        this.neighbors[positions[0][1]/3],
                                        positions[0][1]/3);
                    this.neighbors.push(positions[0][0]/3,
                                        this.neighbors[positions[1][1]/3],
                                        positions[1][1]/3);
                } else if (vertexToMove[0] == 0 && vertexToMove[1] == 0) {
                    this.neighbors.push(this.neighbors[positions[0][2]/3],
                                        positions[1][0]/3,
                                        positions[0][2]/3);
                    this.neighbors.push(this.neighbors[positions[1][2]/3],
                                        positions[0][0]/3,
                                        positions[1][2]/3);
                } else if (vertexToMove[0] == 1 && vertexToMove[1] == 0) {
                    this.neighbors.push(newNeighborIndex + 4,
                                        this.neighbors[positions[0][1]/3],
                                        positions[0][1]/3);
                    this.neighbors.push(this.neighbors[positions[1][2]/3],
                                        newNeighborIndex,
                                        positions[1][2]/3);
                } else if (vertexToMove[0] == 0 && vertexToMove[1] == 1) {
                    this.neighbors.push(this.neighbors[positions[0][2]/3],
                                        newNeighborIndex + 3,
                                        positions[0][2]/3);
                    this.neighbors.push(newNeighborIndex + 1,
                                        this.neighbors[positions[1][1]/3],
                                        positions[1][1]/3);
                }

                // Make the above assignments symmetric.
                for (let i = newNeighborIndex; i < newNeighborIndex+positions.length*3; i++) {
                    if (Number.isInteger(this.neighbors[i])) {
                        this.neighbors[this.neighbors[i]] = i;
                    }
                }
                // Update the reverseIslands.
                let newPositions = this.positions.length-(9*positions.length); // First new position.
                for (let i = 0; i < positions.length; i++) {
                    this.reverseIslands[this.faceFromPosition(newPositions+(9*i))] =
                        this.reverseIslands[this.faceFromPosition(positions[i][0])];
                }
            }
        }
        return splitPositions;
    }

    // Is there a plane passing through pos such that allPos are on
    // the other side of it?
    positionsInSameHemisphere(pos, allPos) {
        // Now we check if all other points are on the
        // same side of this point.
        let firstVertex = null;
        let minAngle = 0;
        let maxAngle = 0;
        let positiveNormal = null;
        let vertex = this.vector3FromPosition(pos);
        let otherVertex = new THREE.Vector3();
        let normal = new THREE.Vector3();
        for (let otherPos of allPos) {
            otherVertex = this.vector3FromPosition(otherPos, otherVertex);
            if (otherVertex.equals(vertex)) {
                continue;  // Ignore, this is the same point.
            }
            if (firstVertex === null) {
                firstVertex = new THREE.Vector3().copy(otherVertex);
                continue;
            }
            let angle = this.angle3(firstVertex, vertex, otherVertex);
            normal = this.cross3(firstVertex, vertex, otherVertex, normal).normalize();
            if (positiveNormal === null && normal.length() > 0) {
                positiveNormal = normal.clone();
            }
            if (positiveNormal !== null &&
                normal.distanceToSquared(positiveNormal) > 2) {
                angle = -angle;
            }
            if (angle < minAngle) {
                minAngle = angle;
            }
            if (angle > maxAngle) {
                maxAngle = angle;
            }
            if (maxAngle - minAngle >= Math.PI) {
                return false;
            }
        }
        return true;
    }

    // Returns true if p is in the triangle a,b,c.  Assumes that
    // p,a,b,c are all pretty much coplanar.  Points on the triangle
    // are considered inside, too.
    pointInTriangle(p, triangle) {
        // Reuse the temporary variable from this.faceNormal();
        let crossProducts = this.faceNormalVector3s;
        for (let i = 0; i < 3; i++) {
            crossProducts[i] = this.cross3(triangle[i], p, triangle[(i+1)%3], crossProducts[i]);
            crossProducts[i].normalize();
        }
        // If there are any two opposite normals, they point is
        // outside.
        for (let i = 0; i < crossProducts.length; i++) {
            if (crossProducts[i].distanceToSquared(crossProducts[(i+1)%3]) > 3) {
                return false;
            }
        }
        return true;
    }

    // After splitting a shape, moves the faces from the BufferGeometryMutator
    // into two BufferGeometryMutators, one for each side.  Returns two
    // BufferGeometryMutators.  The first is the negative side, the second is
    // the positive side.  The original STL is unaffected.
    disconnectAtSplit(plane, splitPositions) {
        let newBufferGeometryMutators = [this.clone(), this.clone()];
        // All faces that are on the split are diconnected from their neighbors.
        let vertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        for (let faceIndex = 0; faceIndex < this.positions.length/9; faceIndex++) {
            let positions = this.positionsFromFace(faceIndex);
            vertices = this.vector3sFromPositions(positions, vertices);
            let distances = [];
            for (let i = 0; i < 3; i++) {
                if (splitPositions.has(this.keyForTrio(positions[i]))) {
                    distances.push(0);
                } else {
                    distances.push(plane.distanceToPoint(vertices[i]));
                }
            }
            if (distances[0] <= 0 && distances[1] <= 0 && distances[2] <= 0) {
                // All negative or 0 so remove from the positive side.
                newBufferGeometryMutators[1].reverseIslands[faceIndex] = null;
            }
            if (distances[0] >= 0 && distances[1] >= 0 && distances[2] >= 0) {
                // All positive or 0 so remove from the negative side.
                newBufferGeometryMutators[0].reverseIslands[faceIndex] = null;
            }
        }
        for (let newBufferGeometryMutator of newBufferGeometryMutators) {
            newBufferGeometryMutator.deleteDegenerates();
        }
        return newBufferGeometryMutators;
    }

    // For each edge, find the edge in the input that leads from its
    // end and the one that leads to its start.  Return a Map from
    // island number to a map of edge splits.  The edge splits are a
    // map from edge to previous edge and next edge.  If a previous or
    // next isn't found, that previous or next is stored as null.
    findEdgesInPlane(splitPositions) {
        let splitEdgesMap = new Map();
        for (let faceIndex = 0; faceIndex < this.positions.length/9; faceIndex++) {
            let island = this.reverseIslands[faceIndex];
            for (let vertexIndex = 0; vertexIndex < 3; vertexIndex++) {
                let position = this.positionFromFaceEdge(faceIndex, vertexIndex);
                let nextPosition = this.nextPositionInFace(position);
                if (splitPositions.has(this.keyForTrio(position)) &&
                    splitPositions.has(this.keyForTrio(nextPosition))) {
                    if (!splitEdgesMap.has(island)) {
                        splitEdgesMap.set(island, new Map());
                    }
                    // This edge is on the split.
                    splitEdgesMap.get(island).set(position, [null, null]);
                }
            }
        }
        for (let islandSplitEdgesMap of splitEdgesMap.values()) {
            for (let splitEdge of islandSplitEdgesMap.keys()) {
                // First we check in one direction.
                let nextSplitEdge = this.getNeighborPosition(splitEdge);
                while (Number.isInteger(nextSplitEdge) && // Have a neighbor.
                       nextSplitEdge != splitEdge && // Not back to the start.
                       !islandSplitEdgesMap.has(nextSplitEdge)) { // Not yet a split edge.
                    // Keep going around the neighbors.
                    nextSplitEdge = this.getNeighborPosition(this.previousPositionInFace(nextSplitEdge));
                }
                if (Number.isInteger(nextSplitEdge) &&
                    islandSplitEdgesMap.has(nextSplitEdge)) {
                    // Found it.  Store it in the map and then do the next edge.
                    islandSplitEdgesMap.get(splitEdge)[1] = nextSplitEdge;
                    islandSplitEdgesMap.get(nextSplitEdge)[0] = splitEdge;
                    continue;
                }
                // Now check in the other direction.
                nextSplitEdge = this.nextPositionInFace(splitEdge);
                let neighborPosition = this.getNeighborPosition(nextSplitEdge);
                while (Number.isInteger(neighborPosition) && // Have a neighbor.
                       nextSplitEdge != splitEdge && // Not back to the start.
                       !islandSplitEdgesMap.has(nextSplitEdge)) { // Not yet a split edge.
                    nextSplitEdge = this.nextPositionInFace(neighborPosition);
                    neighborPosition = this.getNeighborPosition(nextSplitEdge);
                }
                if (Number.isInteger(nextSplitEdge) &&
                    islandSplitEdgesMap.has(nextSplitEdge)) {
                    // Found it.  Store it in the map and then do the next edge.
                    islandSplitEdgesMap.get(splitEdge)[1] = nextSplitEdge;
                    islandSplitEdgesMap.get(nextSplitEdge)[0] = splitEdge;
                    continue;
                }
            }
        }
        return splitEdgesMap;
    }

    sortMap(map, f) {
        // Sorts the insertion order of a map.
        let list = Array.from(map);
        list.sort(f);
        return new Map(list);
    }

    // This is used by fixPlanarHole to find a face that we can make
    // that will be on the convex hull of the split edges.  Returns
    // null if no suitable edge can be found.  This can happen if the
    // shape was nonmanifold in the first place.
    findConvexHullSplitEdge(splitEdgesMap) {
        let v0 = new THREE.Vector3();
        let v1 = new THREE.Vector3();
        // Sort the splitEdgesMap because it makes the search for convex hull faster.
        splitEdgesMap = this.sortMap(splitEdgesMap, (kv0, kv1) => {
            v0 = this.vector3FromPosition(kv0[1][1], v0);
            v1 = this.vector3FromPosition(kv1[1][1], v1);
            if (v0.x != v1.x) {
                return v0.x - v1.x;
            }
            if (v0.y != v1.y) {
                return v0.y - v1.y;
            }
            return v0.z - v1.z;
        });
        // Find an edge on the convex hull of the chop.
        let hullSplitEdge = null;
        let normal = new THREE.Vector3();
        for (let [splitEdge, [previousSplitEdge, nextSplitEdge]] of splitEdgesMap) {
            if(!Number.isInteger(nextSplitEdge)) {
                // This edge doesn't have a suitable next edge.
                continue;
            }
            // The face that we will portentially create
            // is nextSplitEdge's next, nextSplitEdge, and
            // splitEdge.
            normal = this.faceNormalFromPositions([this.nextPositionInFace(nextSplitEdge),
                                                   nextSplitEdge,
                                                   splitEdge],
                                                  normal);
            if (normal.length() < 0.5) {
                // Colinear triangle, no normal.
                continue;
            }
            // Make an iterator of all endpoints from all edges.
            let self = this;
            let allPoints = function* () {
                for (let edge of splitEdgesMap.keys()) {
                    yield edge;
                    yield self.nextPositionInFace(edge);
                }
            };
            if (!this.positionsInSameHemisphere(nextSplitEdge, allPoints())) {
                // This isn't part of the convex hull.
                continue;
            }
            // Found a convex hull splitEdge for making a face.
            return splitEdge;
        }
        return null;
    }

    // Given 3 vertices and splitEdges, makes a triangle that has none
    // of the splitEdges' endpoints in the triangle.  This modifies the vertices[2] in-place.
    makeTriangleWithNoInsidePoints(vertices, splitEdgesMap) {
         // Make a list of all points that might be inside this face.
        let self = this;
        let allPoints = function* () {
            for (let edge of splitEdgesMap.keys()) {
                yield edge;
                yield self.nextPositionInFace(edge);
            }
        };
        // Are there any points in this triangle?  If so, one will
        // replace the third vertex of the new face.
        let maybeInsidePoint = new THREE.Vector3();
        for (let pos of allPoints()) {
            maybeInsidePoint = this.vector3FromPosition(pos, maybeInsidePoint);
            let match = false;
            for (let v of vertices) {
                if (maybeInsidePoint.equals(v)) {
                    match = true;
                    break;
                }
            }
            if (match) {
                continue; // Doesn't count as being inside.
            }
            if (this.pointInTriangle(maybeInsidePoint, vertices)) {
                // Make a smaller triangle using this inside point.
                vertices[2].copy(maybeInsidePoint);
            }
        }
    }

    // Fixes a hole that is entirely in a plane, such as one made from
    // splitting a shape along a plane.
    //
    // The input is a map where the keys are edges in the plane and
    // the values are a pair of the edges.  The first edge points to
    // this edge and the second edge is the edge pointed to, like a
    // doubly-linked list.
    fixPlanarHole(splitEdgesMap) {
        let newVertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        let newColors = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
        let normal = new THREE.Vector3();
        let hullNormal = new THREE.Vector3();
        // Loop until all the plane is sealed.
        while (splitEdgesMap.size > 0) {
            let hullSplitEdge = this.findConvexHullSplitEdge(splitEdgesMap);
            if (!Number.isInteger(hullSplitEdge)) {
                return;
            }
            hullNormal = this.faceNormalFromPositions([this.nextPositionInFace(splitEdgesMap.get(hullSplitEdge)[1]),
                                                       splitEdgesMap.get(hullSplitEdge)[1],
                                                       hullSplitEdge],
                                                      hullNormal);
            // Find all the splitEdges of this hole, in both
            // directions in case the shape wasn't originally
            // manifold.  Store them in the forward direction.
            let holeSplitEdges = new Set();
            let splitEdge;
            for (splitEdge = hullSplitEdge;
                 Number.isInteger(splitEdge) && !holeSplitEdges.has(splitEdge);
                 splitEdge = splitEdgesMap.get(splitEdge)[1]) {
                holeSplitEdges.add(splitEdge);
            }
            if (!Number.isInteger(splitEdge)) {
                // Save the forward edges.
                let forwardHoleSplitEdges = Array.from(holeSplitEdges);
                // Search in the reverse direction.
                holeSplitEdges = new Set();
                for (splitEdge = splitEdgesMap.get(hullSplitEdge)[0];
                     Number.isInteger(splitEdge) && !holeSplitEdges.has(splitEdge);
                     splitEdge = splitEdgesMap.get(splitEdge)[0]) {
                    holeSplitEdges.add(splitEdge);
                }
                // Reverse it so now it's in the forward direction.
                holeSplitEdges = new Set(Array.from(holeSplitEdges).reverse());
                // Add the rest in the forward direction.
                forwardHoleSplitEdges.forEach((x) => holeSplitEdges.add(x));
            }
            // Now we seal all edges from the holeSplitEdges such that
            // the normal matches the hull normal.
            while (holeSplitEdges.size > 0) {
                for (let splitEdge of holeSplitEdges) {
                    let [previousSplitEdge, nextSplitEdge] = splitEdgesMap.get(splitEdge);
                    if (!Number.isInteger(nextSplitEdge)) {
                        // This edge doesn't have a suitable next edge.
                        continue;
                    }
                    // The face that we will portentially create
                    // is nextSplitEdge's next, nextSplitEdge, and
                    // splitEdge.
                    newVertices = this.vector3sFromPositions([this.nextPositionInFace(nextSplitEdge),
                                                              nextSplitEdge,
                                                              splitEdge],
                                                             newVertices);
                    newColors = this.colorsFromPositions([this.nextPositionInFace(nextSplitEdge),
                                                          nextSplitEdge,
                                                          splitEdge],
                                                         newColors);
                    normal = this.faceNormalFromPositions([this.nextPositionInFace(nextSplitEdge),
                                                           nextSplitEdge,
                                                           splitEdge],
                                                          normal);
                    // Don't compare for == 4 because of floating point
                    // rounding issues.
                    if (normal.distanceToSquared(hullNormal) > 3) {
                        // This face is facing the wrong way.
                        continue;
                    }
                    this.makeTriangleWithNoInsidePoints(newVertices, splitEdgesMap);
                    // Add the new face to the positions.
                    let newPosition = this.positions.length;
                    this.setPositions(newVertices, newPosition);
                    if (this.colors) {
                        this.setColors(newColors, newPosition);
                    }
                    // Add all the edges of the new face to the
                    // splitEdges as unconnected.  Also add to the
                    // current holeSplitEdges.
                    for (let i = 0; i < 9; i+=3) {
                        splitEdgesMap.set(newPosition+i, [this.previousPositionInFace(newPosition+i),
                                                          this.nextPositionInFace(newPosition+i)]);
                        holeSplitEdges.add(newPosition+i);
                    }
                    // Connect all unconnectedEdges that can be connected.
                    for (let newUnconnectedEdge of [newPosition, newPosition+3, newPosition+6]) {
                        let connectionCount = 0;
                        for (let otherUnconnectedEdge of splitEdgesMap.keys()) {
                            if (this.equalTrios(newUnconnectedEdge, this.nextPositionInFace(otherUnconnectedEdge)) &&
                                this.equalTrios(this.nextPositionInFace(newUnconnectedEdge), otherUnconnectedEdge)) {
                                // We can connect this.
                                // Connect the neighbors that we've just found.
                                this.neighbors[newUnconnectedEdge/3] = otherUnconnectedEdge/3;
                                this.neighbors[otherUnconnectedEdge/3] = newUnconnectedEdge/3;
                                // Update the doubly-linked split edges.
                                let [previousNew, nextNew] = splitEdgesMap.get(newUnconnectedEdge);
                                let [previousOther, nextOther] = splitEdgesMap.get(otherUnconnectedEdge);
                                if (Number.isInteger(previousNew)) {
                                    splitEdgesMap.get(previousNew)[1] = nextOther;
                                }
                                if (Number.isInteger(previousOther)) {
                                    splitEdgesMap.get(previousOther)[1] = nextNew;
                                }
                                if (Number.isInteger(nextNew)) {
                                    splitEdgesMap.get(nextNew)[0] = previousOther;
                                }
                                if (Number.isInteger(nextOther)) {
                                    splitEdgesMap.get(nextOther)[0] = previousNew;
                                }
                                // Remove the edges that are now connected from the Map.
                                splitEdgesMap.delete(otherUnconnectedEdge);
                                splitEdgesMap.delete(newUnconnectedEdge);
                                // Remove the edges that are now connected from holeSplitEdges.
                                holeSplitEdges.delete(otherUnconnectedEdge);
                                holeSplitEdges.delete(newUnconnectedEdge);
                                break;
                            }
                        }
                    }
                }
                break;
            }
        }
    }

    // Given a plane, split along the plane and return two new
    // BufferGeometryMutators, one for each side.  The BufferGeometryMutators are mended
    // where they were choped.
    chop(plane) {
        let splitPositions = this.splitFaces(plane);

        let newBufferGeometryMutators = this.disconnectAtSplit(plane, splitPositions);
        for (let newBufferGeometryMutator of newBufferGeometryMutators) {
            let splitEdgesMap = newBufferGeometryMutator.findEdgesInPlane(splitPositions);
            // Repair each island.
            for (let island of splitEdgesMap.keys()) {
                newBufferGeometryMutator.fixPlanarHole(splitEdgesMap.get(island));
            }
            // A split might create multiple, diconnected objects.
            newBufferGeometryMutator.computeIslands();
        }
        return newBufferGeometryMutators;
    }

    // Merge faces where possible.
    //
    // Assumes that the current shape has no degenerates.
    //
    // Look for edges where one of the points could be moved to the
    // other point without affecting the shape.  To check this, we
    // look at the normals of all affected faces before and after the
    // move.  The two faces adjacent to the collapsed edge should
    // become degenerate.  The rest should have their normals
    // unchanged.  If that's true, the collapse is valid.
    //
    // Normal unchanged means that the the normal before and after
    // rounding are the same.  The default is not to round.  If
    // rounding is wanted, supply a function that compares rounded
    // Vector3s.  The arguments must not be modified.  Clone the
    // Vector3s if needed.
    //
    // The faces that collpase to degenerates need to later be removed.
    mergeFaces(equalNormals = function(x, y) { return x.equals(y); }) {
        const faceCount = this.positions.length / 9;
        this.removeDegenerates(this.range(faceCount));
        let facesMerged = 0;
        let previousFacesMerged = 0;
        let startVertex = new THREE.Vector3();
        let startColor = new THREE.Color();
        let neighborVertices = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        let neighborNormal = new THREE.Vector3();
        let newNeighborNormal = new THREE.Vector3();
        let triangle = new THREE.Triangle();
        do {
            previousFacesMerged = facesMerged;
            for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
                for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                    if (!Number.isInteger(this.reverseIslands[faceIndex])) {
                        // This face is already a degenerate from
                        // previous merge operations but not yet
                        // deleted from this.positions .  Stop
                        // processing it.  Eventually it will be
                        // removed from this.positions.
                        break;
                    }
                    let startPosition = this.positionFromFaceEdge(faceIndex, edgeIndex);
                    let currentPosition = startPosition;
                    startVertex = this.vector3FromPosition(startPosition, startVertex);
                    startColor = this.colorFromPosition(startPosition, startColor);
                    // Test if moving the point would affect any face normals.
                    do {
                        currentPosition = this.getNeighborPosition(this.nextPositionInFace(currentPosition));
                        if (!Number.isInteger(currentPosition)) {
                            break;
                        }
                        let nextPosition = this.nextPositionInFace(currentPosition);
                        let thirdPosition = this.nextPositionInFace(nextPosition);
                        neighborVertices = this.vector3sFromPositions([currentPosition,
                                                                       nextPosition,
                                                                       thirdPosition], neighborVertices);
                        neighborNormal = triangle.set(...neighborVertices).normal(neighborNormal);
                        // After moving the vertex, this will be the new normal.
                        newNeighborNormal = triangle.set(neighborVertices[0],
                                                         startVertex,
                                                         neighborVertices[2]).normal(newNeighborNormal);
                        if (newNeighborNormal.length() != 0 &&
                            !equalNormals(neighborNormal, newNeighborNormal)) {
                            break;  // This face's normal has changed so we can't move it.
                        }
                    } while (currentPosition != startPosition);
                    if (currentPosition == startPosition) {
                        // We didn't break so this triangle should be collapsable.
                        facesMerged++;
                        let faces = [];
                        do {
                            let nextPosition = this.nextPositionInFace(currentPosition);
                            this.setPositions([startVertex], nextPosition);
                            if (this.colors) {
                                this.setColors([startColor], nextPosition);
                            }
                            faces.push(this.faceFromPosition(currentPosition));
                            currentPosition = this.getNeighborPosition(nextPosition);
                        } while (currentPosition != startPosition);
                        this.removeDegenerates(faces);
                    }
                }
            }
            this.deleteDegenerates();
        } while (facesMerged != previousFacesMerged);
        return facesMerged;
    }

    removeDegenerates(faces) {
        let previousTotalDegeneratesRemoved = 0;
        let totalDegeneratesRemoved = 0;
        let degeneratesRemoved = 0;
        do {
            previousTotalDegeneratesRemoved = totalDegeneratesRemoved;
            totalDegeneratesRemoved += this.removeDegenerates0Angle(faces);
            totalDegeneratesRemoved += this.removeDegenerates180Angle(faces);
        } while(previousTotalDegeneratesRemoved != totalDegeneratesRemoved);
        return totalDegeneratesRemoved;
    }

    // Remove degenerates where two of 3 vertices are the same.
    removeDegenerates0Angle(faces) {
        let degeneratesRemoved = 0;
        for (let faceIndex of faces) {
            if (!Number.isInteger(this.reverseIslands[faceIndex])) {
                // Already going to be removed.
                continue;
            }
            // Find if there are two identical vertices.
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let position = this.positionFromFaceEdge(faceIndex, edgeIndex);
                let nextPosition = this.nextPositionInFace(position);
                if (this.equalTrios(position, nextPosition)) {
                    // Found a degenerate.
                    degeneratesRemoved++;
                    let edge1 = nextPosition;
                    let edge2 = this.nextPositionInFace(edge1);
                    // Connect their neighbors.
                    if (Number.isInteger(this.neighbors[edge1/3])) {
                        this.neighbors[this.neighbors[edge1/3]] = this.neighbors[edge2/3];
                    }
                    if (Number.isInteger(this.neighbors[edge2/3])) {
                        this.neighbors[this.neighbors[edge2/3]] = this.neighbors[edge1/3];
                    }
                    this.reverseIslands[faceIndex] = null;
                }
            }
        }
        return degeneratesRemoved;
    }

    // Move the edge that connects to triangles and instead put it
    // between the other two points.
    //
    // position is the edge to move.  The new edge that joins the two
    // faces after rotation will be the one previous to position.
    rotateEdge(position) {
        let positions = [];
        positions[0] = [this.nextPositionInFace(position)];
        positions[0].push(this.nextPositionInFace(positions[0][0]),
                          this.previousPositionInFace(positions[0][0]));
        // Get neighbors so that positions[0][2] is connected to
        // positions[1][0] and positions[1][2] is connected to
        // positions[0][0].
        positions[1] = [this.nextPositionInFace(this.getNeighborPosition(positions[0][2]))];
        positions[1].push(this.nextPositionInFace(positions[1][0]),
                          this.previousPositionInFace(positions[1][0]));
        let vertices = [];
        let colors = [];
        for (let i = 0; i < 2; i++) {
            vertices[i] = this.vector3sFromPositions(positions[i]);
            colors[i] = this.colorsFromPositions(positions[i]);
        }
        for (let i = 0; i < 2; i++) {
            this.setPositions([vertices[i][1]], positions[1-i][2]);
            if (this.colors) {
                this.setColors([colors[i][1]], positions[1-i][2]);
            }
        }
        // Adjust neighbors.
        for (let i=0; i < 2; i++) {
            this.neighbors[positions[  i][2]/3] = this.neighbors[positions[1-i][1]/3];
            this.neighbors[positions[1-i][1]/3] =                positions[  i][1]/3;
        }
        // Make the above neighbor assignments symmetric.
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 3; j++) {
                if (Number.isInteger(this.neighbors[positions[i][j]/3])) {
                    this.neighbors[this.neighbors[positions[i][j]/3]] = positions[i][j]/3;
                }
            }
        }
    }

    // Angle of abc.
    angle3(left, middle, right) {
        return this.vertexLeft.copy(left).sub(middle).angleTo(this.vertexRight.copy(right).sub(middle));
    }

    // ba cross bc.
    cross3(left, middle, right, target) {
        target = target || new THREE.Vector3();
        return target.copy(left).sub(middle).cross(this.vertexRight.copy(right).sub(middle));
    }

    // Try to get rid of thin, sliver triangles using triangle flips.
    // https://en.wikipedia.org/wiki/Delaunay_triangulation#Flip_algorithms
    //
    // If two triangles have the same normal, see if connecting edge
    // can be rotated to make the triangles not have small angles.
    retriangle(faces, equalNormals = function(x, y) { return x.equals(y); }) {
        let edgesRotated = 0;
        let previousEdgesRotated;
        let vertices = [[new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
                        [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]];
        let normals = [new THREE.Vector3(), new THREE.Vector3()];
        let triangle = new THREE.Triangle();
        // Edges which potentially still need to be rotated.
        let edgePositionsDelaunay = new Set();
        for (let i = 0; i < this.positions.length; i+=3) {
            edgePositionsDelaunay.add(i);
        }
        do {
            previousEdgesRotated = edgesRotated;
            for (let pos of edgePositionsDelaunay) {
                let faceIndex = this.faceFromPosition(pos);
                edgePositionsDelaunay.delete(pos);
                if (!Number.isInteger(this.reverseIslands[faceIndex])) {
                    // Already going to be removed.
                    continue;
                }
                let positions = [[pos, this.nextPositionInFace(pos), this.previousPositionInFace(pos)]];
                positions[1] = [this.getNeighborPosition(positions[0][0])];
                if (!Number.isInteger(positions[1][0])) {
                    continue; // No neighbor for flip.
                }
                edgePositionsDelaunay.delete(positions[1][0]);
                positions[1].push(this.nextPositionInFace(positions[1][0]),
                                  this.previousPositionInFace(positions[1][0]));
                for (let i = 0; i < 2; i++) {
                    vertices[i] = this.vector3sFromPositions(positions[i], vertices[i]);
                }
                if (this.angle3(vertices[0][1], vertices[0][2], vertices[0][0]) +
                    this.angle3(vertices[1][1], vertices[1][2], vertices[1][0]) <= Math.PI) {
                    // Rotating this edge would not be an improvement.
                    continue;
                }
                for (let i = 0; i < 2; i++) {
                    normals[i] = triangle.set(...vertices[i]).normal(normals[i]);
                }
                if (!equalNormals(normals[0], normals[1])) {
                    // We can't move these around because the normals are too different.
                    continue;
                }
                this.rotateEdge(positions[0][0]);
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 2; j++) {
                        edgePositionsDelaunay.add(positions[i][j]);
                    }
                }
                edgesRotated++;
            }
        } while (edgePositionsDelaunay.size > 0);
        return edgesRotated;
    }

    // Make the shape manifold by connecting edges that aren't
    // connected.  If island is null, ignore islands and rebuild at
    // the end.
    fixHoles(island = null) {
        // Find all the edges that are unconnected.
        let unconnectedEdges = new Set();
        for (let i = 0; i < this.neighbors.length; i++) {
            if (!Number.isInteger(this.neighbors[i]) &&
                (!Number.isInteger(island) ||
                 this.reverseIslands[this.faceFromPosition(i*3)] == island)) {
                unconnectedEdges.add(i*3);
            }
        }
        // Get the score of a triangle with these sides.  Lower is better.
        let score = (() => {
            let triangle = new THREE.Triangle();
            return (a, b, c, otherNormal) => {
                let normal = triangle.set(a, b, c).normal();
                // This is similar to angleTo if all vectors are
                // length 1, which they are.
                return normal.distanceToSquared(otherNormal);
                //return otherNormal.angleTo(normal);
            }
        })();
        let a = new THREE.Vector3();
        let b = new THREE.Vector3();
        let c = new THREE.Vector3();
        let unconnectedEdgeNormal = new THREE.Vector3();
        while (unconnectedEdges.size > 0) {
            // Find the best new face to add to the object.
            let smallestScore = Infinity;
            let smallestABC = null;
            for (let unconnectedEdge of unconnectedEdges.values()) {
                // First two vertices in the new triangle.
                a = this.vector3FromPosition(this.nextPositionInFace(unconnectedEdge), a);
                b = this.vector3FromPosition(unconnectedEdge, b);
                unconnectedEdgeNormal = this.faceNormal(this.faceFromPosition(unconnectedEdge),
                                                        unconnectedEdgeNormal);
                // Find all possible triangles connecting to this edge.
                for (let unconnectedVertex of unconnectedEdges) {
                    for (let cPos of [unconnectedVertex,
                                      this.nextPositionInFace(unconnectedVertex)]) {
                        c = this.vector3FromPosition(cPos, c);
                        if (c.equals(a) || c.equals(b)) {
                            continue; // No degenerates.
                        }
                        let currentScore = score(a, b, c, unconnectedEdgeNormal);
                        if (smallestScore > currentScore) {
                            smallestScore = currentScore;
                            smallestABC = [this.nextPositionInFace(unconnectedEdge), unconnectedEdge, cPos];
                        }
                    }
                }
            }
            // Add the new face to the positions.
            let newPosition = this.positions.length;
            this.setPositions(this.vector3sFromPositions(smallestABC, [a, b, c]), newPosition);
            this.setColors(this.colorsFromPositions(smallestABC, [a, b, c]), newPosition);
            // Add all the edges to the unconnected edges.
            unconnectedEdges.add(newPosition);
            unconnectedEdges.add(newPosition+3);
            unconnectedEdges.add(newPosition+6);
            // Connect all unconnectedEdges that can be connected.
            for (let newUnconnectedEdge of [newPosition, newPosition+3, newPosition+6]) {
                for (let otherUnconnectedEdge of unconnectedEdges) {
                    if (this.equalTrios(newUnconnectedEdge, this.nextPositionInFace(otherUnconnectedEdge)) &&
                        this.equalTrios(this.nextPositionInFace(newUnconnectedEdge), otherUnconnectedEdge)) {
                        // We can connect this.
                        this.neighbors[newUnconnectedEdge/3] = otherUnconnectedEdge/3;
                        this.neighbors[otherUnconnectedEdge/3] = newUnconnectedEdge/3;
                        unconnectedEdges.delete(otherUnconnectedEdge);
                        unconnectedEdges.delete(newUnconnectedEdge);
                    }
                }
            }
            this.reverseIslands[(this.positions.length-9)/9] = island;
        }
        if (!Number.isInteger(island)) {
            // Need to recreate all the islands.
            this.computeIslands();
        }
    }

    computeIslands() {
        let faces = [];
        for (let faceIndex = 0; faceIndex < this.positions.length/9; faceIndex++) {
            faces[faceIndex] = {
                // At first, each face is an island by itself.  Later, we'll join faces.
                'island': faceIndex,
                // The rank for the union-join algorithm on islands.
                'rank': 0
            }
        }
        // Find the island to which this face belongs using the
        // union-join algorithm.
        let findIsland = (faceIndex) => {
            if (faces[faceIndex].island != faceIndex) {
                faces[faceIndex].island = findIsland(faces[faceIndex].island);
            }
            return faces[faceIndex].island;
        }

        // Join the islands to which face1 and face2 belong.  Returns
        // the new joined root, for convenience.
        let joinIslands = (face1, face2) => {
            // Union join needed?
            let root1 = findIsland(face1);
            let root2 = findIsland(face2);
            if (root1 == root2) {
                return root1;
            }
            // Need to join.
            if (faces[root1].rank < faces[root2].rank) {
                faces[root1].island = root2;
                return root2;
            } else if (faces[root2].rank < faces[root1].rank) {
                faces[root2].island = root1;
                return root1;
            } else {
                faces[root2].island = root1;
                faces[root1].rank++;
                return root1;
            }
        }
        this.reverseIslands = [];
        for (let faceIndex = 0; faceIndex < this.positions.length/9; faceIndex++) {
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let position = this.positionFromFaceEdge(faceIndex, edgeIndex);
                let neighborPosition = this.getNeighborPosition(position);
                if (Number.isInteger(neighborPosition)) {
                    let neighborFace = this.faceFromPosition(neighborPosition);
                    joinIslands(faceIndex, neighborFace);
                }
            }
        }
        for (let faceIndex = 0; faceIndex < this.positions.length/9; faceIndex++) {
            this.reverseIslands[faceIndex] = findIsland(faceIndex);
        }
    }

    // Fix holes without connecting between islands.
    fixHolesByIsland() {
        let seenIslands = new Set();
        for (let island of this.reverseIslands) {
            if (!seenIslands.has(island)) {
                this.fixHoles(island);
            }
            seenIslands.add(island);
        }
    }

    // Reconnect faces with a normal of 0 due to a 180 degree angle so
    // that the output will have only faces with normal non-zero.
    removeDegenerates180Angle(faces) {
        let degeneratesRemoved = 0;
        const zeroVector = new THREE.Vector3(0,0,0);
        let triangle = new THREE.Triangle();
        for (let faceIndex of faces) {
            if (!Number.isInteger(this.reverseIslands[faceIndex]) ||
                this.isFaceDegenerate(faceIndex)) {
                // Already going to be removed or is degenerate.
                continue;
            }
            // positions[0] for current face, positions[1] for
            // neighbor.
            let positions = [];
            positions[0] = this.positionsFromFace(faceIndex);
            let vertices = [];
            vertices[0] = this.vector3sFromPositions(positions[0]);
            let normal = triangle.set(...vertices[0]).normal();
            if (!normal.equals(zeroVector)) {
                // Nothing to do.
                continue;
            }
            // Try to find largest angle, it should be the 180
            // degree angle.
            let largestIndex = 0;
            let largestAngle = -Infinity;
            for (let i = 0; i < 3; i++) {
                let left = vertices[0][i % 3];
                let middle = vertices[0][(i+1) % 3];
                let right = vertices[0][(i+2) % 3];
                let angle = this.angle3(left, middle, right);
                if (angle > largestAngle) {
                    largestIndex = (i+1) % 3; // The middle point of a 180 degree angle.
                    largestAngle = angle;
                }
            }
            this.rotateEdge(this.positionFromFaceEdge(faceIndex, (largestIndex+1) % 3));
            degeneratesRemoved++;
        }
        return degeneratesRemoved;
    }

    // Rewrite the list of faces without the degenerates in it.
    deleteDegenerates() {
        const faceCount = this.positions.length / 9;

        let degeneratesRemoved = 0;
        let newPositions = [];
        let newColors = []; // Only if this.colors is not undefined.
        let newFaceIndex = [];  // Map from where a face was to where it is after deletions.
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
                let newNeighborPosition = (Number.isInteger(oldNeighborPosition) &&
                                           Number.isInteger(newFaceIndex[this.faceFromPosition(oldNeighborPosition)])) ?
                    this.positionFromFaceEdge(newFaceIndex[this.faceFromPosition(oldNeighborPosition)],
                                              this.edgeFromPosition(oldNeighborPosition))
                    : null;
                newNeighbors[newPosition/3] = Number.isInteger(newNeighborPosition) ? newNeighborPosition/3 : newNeighborPosition;
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

export { BufferGeometryMutator };
