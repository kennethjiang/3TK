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
        return Math.round( v1 * precision ) + '_' + Math.round( v2 * precision ) + '_' + Math.round( v3 * precision );

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

        var neighboringFacesOf = function( faceIndex ) {

            var neighboringFaces = new Set(); // Set of faceIndex that neighbors current face

            for ( var v = 0; v < 3; v++) { // For each vertex on the same face

                var posIndex = faceIndex + v*3;

                var key = keyForTrio(originalPositions, posIndex, precisionPoints);
                var verticesOnSamePosition = vertexPosMap[key];

                // add faces correspoding to these vertices as neighbors
                verticesOnSamePosition.forEach( function( posIndex ) {
                    neighboringFaces.add( Math.floor(posIndex/9) );
                });
            }

            return neighboringFaces;
        }

        var graph = new FaceGraph(originalPositions, precisionPoints, neighboringFacesOf);

        var geometries = graph.floodFill().map( function( island ) {

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
