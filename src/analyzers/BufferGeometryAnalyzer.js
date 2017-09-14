/**
 * @author kennethjiang / https://github.com/kennethjiang
 *
 */

import * as THREE from 'three'

/**
 * Calculate the key for the "trio" - 3 consecutive numbers in `array` starting from `startIndex`
 * precisionPoints = 4; // number of decimal points, e.g. 4 for epsilon of 0.0001
 */
function keyForTrio( array, startIndex, precisionPoints = 4 ) {

        let [v1, v2, v3] = [ array[startIndex], array[startIndex+1], array[startIndex+2] ];

        var precision = Math.pow( 10, precisionPoints );
        return v1 + '_' + v2 + '_' + v3;

}

/**
 * map of { key (= xyz coorindate) -> array of position indices sharing the same key }
 */
function vertexPositionMap( positions, precisionPoints ) {
    var map = {};

    // establish posIndexMap;
    for ( var posIndex = 0; posIndex <= positions.length-2; posIndex += 3) {
        var key = keyForTrio(positions, posIndex, precisionPoints);
        if ( ! map.hasOwnProperty(key) ) {
            map[key] = [posIndex];
        } else {
            map[key].push(posIndex);
        }
    }

    return map;
}

/**
 * The gragh of how faces are connected (touching) each other
 */
function FaceGraph( positions, precisionPoints, neighboringFacesOf) {
    var self = this;

    // Establish the graph by iterating through faces and establish how they are connected (touching)
    //
    // faceArray[i] is corresponding to positions[i*9..i*9+8] = 3 vertices X trio of positions (x, y, z)
    // this is the key to understand the code
    var faceArray= [];

    for (var faceIndex = 0; faceIndex < positions.length-8; faceIndex += 9) { // a face is 9 positions - 3 vertex x 3 positions
        var neighboringFaces = neighboringFacesOf( faceIndex );
        // Remove self from neighbors
        neighboringFaces.delete( faceIndex/9 );

        faceArray[faceIndex/9] = { faceIndex, neighbors: neighboringFaces};
    }

    /**
     * Return groups of connected faces using flood-fill algorithm
     * Return:
     *   Array of { faceIndices: [ index of faces ] }
     */
    self.floodFill = function() {

        var islands = []; // islands are array of faces that are connected

        faceArray.forEach( function( start ) {

            if (start.island !== undefined) {
                return ;
            }

            var island = { faceIndices: [] };
            islands.push(island);

            // Breadth-first traversal
            var queue = [];

            // Mark the source face as visited and enqueue it
            start.island = island;
            island.faceIndices.push(start.faceIndex);
            queue.unshift(start);

            while (queue.length > 0) {

                // Dequeue a face from queue
                var face = queue.pop(0);

                // Get all adjacent faces of the dequeued
                // face s. If an adjacent has not been visited,
                // then mark it visited and enqueue it
                face.neighbors.forEach( function(i) {
                    var nextFace = faceArray[i];

                    if ( nextFace.island === undefined ) {
                        queue.unshift(nextFace);
                        nextFace.island = island;
                        island.faceIndices.push( nextFace.faceIndex );
                    }
                });
            }
        });

        return islands;
    };

}

/*// Returns the unit normal of a triangular face.
  var faceNormal = function( positions, posIndex ) {
  return new THREE.Triangle(
  new THREE.Vector3().fromArray(positions, posIndex+0),
  new THREE.Vector3().fromArray(positions, posIndex+3),
  new THREE.Vector3().fromArray(positions, posIndex+6)).normal();
  }

  // Returns the angle between faces 0 to 2pi.
  // A smaller angle indicates less encolsed space.
  // Assumes that the common edge is posIndex1 to posIndex1+3 and
  // posIndex2 to posIndex2-3.
  var facesAngle = function( positions, posIndex1, posIndex2 ) {
  var normal1 = faceNormal(originalPositions, posIndex1 - (posIndex1 % 9));
  var normal2 = faceNormal(originalPositions, posIndex2 - (posIndex2 % 9));
  var commonPoint1 = new THREE.Vector3().fromArray(positions, posIndex1);
  var commonPoint2 = new THREE.Vector3().fromArray(positions, nextPositionInFace(posIndex1));
  var edge1 = commonPoint2.clone().sub(commonPoint1);
  var normalsAngle = normal1.angleTo(normal2); // Between 0 and pi.
  var facesAngle = Math.PI;
  if (normal1.clone().cross(normal2).dot(edge1) > 0) {
  facesAngle -= normalsAngle;
  } else {
  facesAngle += normalsAngle;
  }
  return facesAngle;
  }*/
var BufferGeometryAnalyzer = {

    /**
     *
     * Description: Seperator Geometry with unconnected islands into their own Geometries
     *
     * parameters:
     *   - precisionPoints: number of decimal points, e.g. 4 for epsilon of 0.0001. 2 vertices are considered "the same" when they are with the distance defined by precisionPoints
     */

    isolatedGeometries: function ( geometry, precisionPoints=4 ) {
        var originalPositions = geometry.attributes.position.array;
        var originalNormals = geometry.attributes.normal !== undefined ? geometry.attributes.normal.array : undefined;
        var originalColors = geometry.attributes.color !== undefined ? geometry.attributes.color.array : undefined;

        var vertexPosMap = vertexPositionMap( originalPositions, precisionPoints );

        let positionFromFace = function (faceIndex) {
            return faceIndex*9;
        }
        let positionFromFaceEdge = function (faceIndex, edgeIndex) {
            return positionFromFace(faceIndex) + 3*edgeIndex;
        }
        let vertex3FromFaceEdge = function (faceIndex, edgeIndex) {
            return new THREE.Vertex3().fromArray(originalPositions, positionFromFaceEdge(faceIndex, edgeIndex));
        }
        let nextPositionInFace = function (posIndex) {
            if (posIndex % 9 == 6) {
                return posIndex - 6;
            } else {
                return posIndex + 3;
            }
        }
        let previousPositionInFace = function (posIndex) {
            if (posIndex % 9 == 0) {
                return posIndex + 6;
            } else {
                return posIndex - 3;
            }
        }

        const faceCount = originalPositions.length/9;
        let faces = [];
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            faces[faceIndex] = {
                // possibleNeighbors is an array of length 3, one for each edge.
                // edge 0 is from point a to b, edge 1 is from b to c, edge 2 is from c to a
                // each element is a list of position indices that could be neighbors for this face.
                'possibleNeighbors': [new Set(), new Set(), new Set()],
                // These are selected neighbors, null until they are found.
                'neighbors': [null, null, null],
                // At first, each face is an island by itself.  Later, we'll join faces.
                'island': faceIndex,
                // The below elements are only valid if faces[faceIndex].island = faceIndex;
                // The rank for the union-join algorithm on islands.
                'rank': 0,
                // For this island, the set of edges (position indicies) that still need connecting.
                'frontier': new Set();
            };
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let posIndex = positionFromFaceEdge(faceIndex, edgeIndex);
                let key = keyForTrio(originalPositions, posIndex, precisionPoints);
                let keyNext = keyForTrio(originalPositions, nextPositionInFace(posIndex), precisionPoints);
                for (let newPosIndex of vertexPosMap[key]) {
                    // A face is only neighboring if the edges are in
                    // common and point in opposite directions.
                    let newKeyPrevious = keyForTrio(originalPositions, previousPositionInFace(newPosIndex), precisionPoints);
                    if (keyNext != newKeyPrevious) {
                        continue;
                    }
                    // This neighboring face is connected.
                    // We'll ignore degenerate triangles.
                    let newFacePoints = new Set([key,
                                                 newKeyPrevious,
                                                 keyForTrio(originalPositions, nextPositionInFace(newPosIndex), precisionPoints);
                                                ]);
                    if (newFacePoints.size != 3) {
                        continue;
                    }
                    // We're able to connect to the edge newKey and newKeyPrevious, which is the newKeyPrevious edge.
                    faces[faceIndex].possibleNeighbors[edgeIndex].add(previousPositionInFace(newPosIndex));
                }
            }
        }

        // We have all all possible edge connections in the faces array.
        let unconnectedEdges = new Set();
        for (let i = 0; i < faceCount*9; i+=3) {
            unconnectedEdges.add(i);
        }

        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            let facePoints = new Set();
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                facePoints.add(keyForTrio(originalPositions, positionFromFaceEdge(faceIndex, edgeIndex), precisionPoints));
            }
            faces[faceIndex].degenerate = (edgeIndex.size != 3);
            if (faces[faceIndex].degenerate) {
                // Remove all degenerate faces.
                for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                    unconnectedEdges.delete(positionFromFaceEdge(faceIndex, edgeIndex));
                }
                faces[faceIndex].island = null; // Not a member of any new object.
                faces.possibleNeighbors = [[], [], []]; // Can't have neighbors.
            } else {
                for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                    faces[faceIndex].frontier.add(positionFromFaceEdge(faceIndex, edgeIndex));
                }
            }
        }

        let findIsland = function(faceIndex) {
            if (faces[faceIndex].island != null && faces[faceIndex].island != faceIndex) {
                faces[faceIndex] = findIsland(faces[faceIndex])
            }
            return faces[faceIndex].island;
        }

        let faceFromPosition = function (positionIndex) {
            return Math.floor(positionIndex/9);
        }
        let edgeFromPosition = function (positionIndex) {
            return (positionIndex % 9) / 3;
        }
        let connectEdge = function(posIndex1, posIndex2) {
            let face1 = faceFromPosition(posIndex1);
            let edge1 = edgeFromPosition(posIndex1);
            // Remove posIndex1 as possible neighbor for all its neighbors.
            for (let possibleNeighbor of faces[face1].possibleNeighbors[edge1]) {
                let possibleNeighborFace = faceFromPosition(possibleNeighbor);
                let possibleNeighborEdge = edgeFromPosition(possibleNeighbor);
                faces[possibleNeighborFace].possibleNeighbors[possibleNeighborEdge].delete(posIndex1);
            }
            let face2 = faceFromPosition(posIndex2);
            let edge2 = edgeFromPosition(posIndex2);
            // Remove posIndex2 as possible neighbor for all its neighbors.
            for (let possibleNeighbor of faces[face2].possibleNeighbors[edge2]) {
                let possibleNeighborFace = faceFromPosition(possibleNeighbor);
                let possibleNeighborEdge = edgeFromPosition(possibleNeighbor);
                faces[possibleNeighborFace].possibleNeighbors[possibleNeighborEdge].delete(posIndex2);
            }
            // Set actual neighbors.
            faces[face1].neighbor[edge1] = posIndex2;
            faces[face2].neighbor[edge2] = posIndex1;
            // Union join needed?
            let root1 = findIsland(face1);
            let root2 = findIsland(face2);
            if (root1 != root2) {
                // Yes, need to join.
                if (faces[root1].rank < faces[root2].rank) {
                    faces[root1].island = root2;
                } else if (faces[root2].rank < faces[root1].rank) {
                    faces[root2].island = root1;
                } else {
                    faces[root2].island = root1;
                    faces[root1].rank++;
                }
                // Union of the frontier.
                for (let posIndex of faces[root1].frontier) {
                    faces[root2].frontier.add(posIndex);
                }
                // Only the root matters so they can be copies.
                faces[root1].frontier = faces[root2].frontier;
            }
        }
        while (unconnectedEdges.size > 0) {
            // Connect all forced edges.
            for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
                for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                    if (!faces[faceIndex].degenerate &&
                        faces[faceIndex].neighbors[edgeIndex] == null &&
                        faces[faceIndex].possibleNeighbors[edgeIndex].size == 1) {
                        connectEdge(positionFromFaceEdge(faceIndex, edgeIndex),
                                    faces[faceIndex].possibleNeighbors[edgeIndex][0]);
                    }
                }
            }
        }

        // All done, now get all the islands.
        var islands = {};
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            let islandIndex = findIsland(faceIndex);
            if (islandIndex !== null) {
                if (islands[islandIndex] === undefined) {
                    islands[islandIndex] = [];
                }
                islands[islandIndex].push(faceIndex);
            }
        }
        for (let island of islands) {

            var geometry = new THREE.BufferGeometry();

            var vertices = [];
            var normals = [];
            var colors = [];

            for (let faceIndex of island) {
                let posIndex = positionFromFace(faceIndex);

                for (var i = 0; i < 9; i++) {

                    vertices.push( originalPositions[posIndex + i] );

                    if (originalNormals) {
                        normals.push( originalNormals[posIndex + i] );
                    }

                    if (originalColors) {
                        colors.push( originalColors[posIndex + i] );
                    }

                }

            });

            geometry.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array( vertices ), 3 ) );

            if (originalNormals) {
                geometry.addAttribute( 'normal', new THREE.BufferAttribute( new Float32Array( normals ), 3 ) );
            }

            if (originalColors) {
                geometry.addAttribute( 'color', new THREE.BufferAttribute( new Float32Array( colors ), 3 ) );
            }

            return geometry;
        });

        return geometries;
    },

    /**
     * surfaces: groups of contious faces that share the same normal
     */
    surfaces: function( geometry, precisionPoints=4 ) {

        if (geometry.index) {
            throw new Error('Can not handle indexed faces right now. Open an issue to request it at "https://github.com/kennethjiang/3tk/issues/new"');
        }

        if (geometry.attributes.normal === undefined) {
            throw new Error('BufferGeometry is missing normals. Can not calculate surfaces');
        }
        var normals = geometry.attributes.normal.array;
        var positions = geometry.attributes.position.array;

        var vertexPosMap = vertexPositionMap( positions, precisionPoints );

        // Faces are considered neighboring when 1. they share at least 1 vertex, and 2. they have the same normal
        var neighboringFacesOf = function( faceIndex ) {

            var neighboringFaces = new Set(); // Set of faceIndex that neighbors current face

            var currentNormal = normals.slice(faceIndex, faceIndex+3); //normals for all 3 vertices should be the same. Take the 1st one

            for ( var v = 0; v < 3; v++) { // For each vertex on the same face

                var posIndex = faceIndex + v*3;

                var key = keyForTrio(positions, posIndex, precisionPoints);
                var verticesOnSamePosition = vertexPosMap[key];

                // add faces correspoding to these vertices as neighbors
                verticesOnSamePosition.filter( function( posIndex ) {

                    var precision = Math.pow( 10, precisionPoints );
                    var diff = Math.abs( Math.round( (currentNormal[0] - normals[posIndex]) * precision ) )
                          + Math.abs( Math.round( (currentNormal[1] - normals[posIndex+1]) * precision ) )
                        + Math.abs( Math.round( (currentNormal[2] - normals[posIndex+2]) * precision ) );
                    return diff < 1;

                }).forEach( function( posIndex ) {
                    neighboringFaces.add( Math.floor(posIndex/9) );
                });
            }

            return neighboringFaces;
        }

        var graph = new FaceGraph(positions, precisionPoints, neighboringFacesOf);

        var surfaces = graph.floodFill();
        surfaces.forEach( function( surface ) {
            surface.normal = new THREE.Vector3(
                            normals[surface.faceIndices[0]],
                            normals[surface.faceIndices[0]+1],
                            normals[surface.faceIndices[0]+2]).normalize();
        });

        return surfaces;
    },

    sortedSurfacesByArea: function( geometry, precisionPoint=4 ) {

        var positions = geometry.attributes.position.array;

        // This is not really the area of the face. But it seems to be proportional to the area:
        // https://github.com/mrdoob/three.js/blob/dev/src/core/Geometry.js#L435
        var areaOfFace = function(faceIndex) {

            var vA = new THREE.Vector3(positions[faceIndex], positions[faceIndex+1], positions[faceIndex+2]);
            var vB = new THREE.Vector3(positions[faceIndex+3], positions[faceIndex+4], positions[faceIndex+5]);
            var vC = new THREE.Vector3(positions[faceIndex+6], positions[faceIndex+7], positions[faceIndex+8]);
            var cb = new THREE.Vector3(), ab = new THREE.Vector3();

            cb.subVectors( vC, vB );
            ab.subVectors( vA, vB );
            cb.cross( ab );

            return cb.length();
        }

        var surfaces = BufferGeometryAnalyzer.surfaces(geometry, precisionPoint);
        surfaces.forEach( function(surface) {
            surface.area = surface.faceIndices.reduce( function(sum, faceIndex) { return sum + areaOfFace(faceIndex) ; }, 0);
        });

        return surfaces.sort( function(a,b) { return b.area - a.area; } );
    }

}

export { BufferGeometryAnalyzer }
