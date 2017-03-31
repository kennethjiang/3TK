/**
 * @author kennethjiang / https://github.com/kennethjiang
 *
 */

import * as THREE from 'three'

/**
 * Calculate the key for the "trio" - 3 consecutive numbers in `array` starting from `startIndex`
 * precisionPoints = 4; // number of decimal points, e.g. 4 for epsilon of 0.0001
 *
 */
function keyForTrio( array, startIndex, precisionPoints = 4 ) {

        let [v1, v2, v3] = [ array[startIndex], array[startIndex+1], array[startIndex+2] ];

        var precision = Math.pow( 10, precisionPoints );
        return Math.round( v1 * precision ) + '_' + Math.round( v2 * precision ) + '_' + Math.round( v3 * precision );

}

function VertexGraph( positions, precisionPoints ) {
    var self = this;

    var posIndexMap = {}; // map of { key (= xyz coorindate) -> array of position indices sharing the same key }

    // establish posIndexMap;
    for ( var posIndex = 0; posIndex <= positions.length-2; posIndex += 3) {
        var key = keyForTrio(positions, posIndex, precisionPoints);
        if ( ! posIndexMap.hasOwnProperty(key) ) {
            posIndexMap[key] = [posIndex];
        } else {
            posIndexMap[key].push(posIndex);
        }
    }

    // Establish the graph by connecting the nodes
    //
    // nodeArray[i] is corresponding to trio of (positions[i*3], positions[i*3+1], positions[i*3+2]), which is
    // the key to understand the code
    var faceArray= [];

    for (var faceIndex = 0; faceIndex <= positions.length-8; faceIndex += 9) { // a face is 9 positions - 3 vertex x 3 positions

        var neighboringFaces = new Set(); // Set of faceIndex that neighbors current face

        for ( var v = 0; v < 3; v++) { // For each vertex on the same face

            var posIndex = faceIndex + v*3;

            var key = keyForTrio(positions, posIndex, precisionPoints);
            var verticesOnSamePosition = posIndexMap[key];

            // add faces correspoding to these vertices as neighbors
            verticesOnSamePosition.forEach( function( posIndex ) {
                neighboringFaces.add( Math.floor(posIndex/9) );
            });
        }

        // Remove self from neighbors
        neighboringFaces.delete( faceIndex/9 );

        faceArray[faceIndex/9] = { faceIndex, neighbors: neighboringFaces};

    }

    self.islands = []; // islands are array of nodes that are connected

    faceArray.forEach( function( face ) {

        if (face.island !== undefined) {
            return ;
        }

        var newIsland = { faceIndices: [] };
        floodFill(face, newIsland)
        self.islands.push(newIsland);
    });


    function floodFill(start, island) {

        // Breadth-first traversal
        var queue = [];

        // Mark the source face as visited and enqueue it
        queue.unshift(start);
        start.island = island;
        island.faceIndices.push(start.faceIndex);

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
    };

}


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

        var graph = new VertexGraph(originalPositions, precisionPoints);

        var geometries = graph.islands.map( function( island ) {

            var geometry = new THREE.BufferGeometry();

            var vertices = [];
            var normals = [];
            var colors = [];

            island.faceIndices.forEach( function( posIndex ) {

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

    normalToFaceMap: function( geometry, precisionPoint=4 ) {

        if (geometry.attributes.normal === undefined) {
            throw new Error('BufferGeometry is missing normals. Can not calculate the map');
        }
        var normals = geometry.attributes.normal.array;

        var map = new Map();
        for (var faceIndex = 0; faceIndex < normals.length; faceIndex += 9) { // a normal is 3 floats for each vertex

            var key = keyForTrio(normals, faceIndex, precisionPoint ); //normals for all 3 vertices should be the same. Take the 1st one
            if ( ! map.has( key ) ) {
                map.set(key, { normal: normals.slice(faceIndex, faceIndex+3), indices: [faceIndex] });
            } else {
                map.get(key).indices.push(faceIndex);
            }
        }

        return map;

    },

    sortedNormalsByFaceArea: function( geometry, precisionPoint=4 ) {

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

        var normalMap = BufferGeometryAnalyzer.normalToFaceMap(geometry, precisionPoint);

        var result = []
        for ( var value of normalMap.values() ) {
            value.area = value.indices.reduce(function(sum, faceIndex) {  return sum + areaOfFace(faceIndex) ; }, 0);
            result.push(value);
        }

        return result.sort( function(a,b) { return b.area - a.area; } );
    }

}

export { BufferGeometryAnalyzer }
