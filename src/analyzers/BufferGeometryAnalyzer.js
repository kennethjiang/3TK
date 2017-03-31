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

// VertexNode sounds like oxymoron, but here Vertex is in the context of Geometry, and Node is in the context of Graph programming data structure
function VertexNode( posIndex ) {
    var self = this;
    self.neighbors = new Set();
    self.island = undefined;

    self.addNeighbor = function( vertexNode ) {
        if (vertexNode === self) {
            return ;
        }

        self.neighbors.add( vertexNode );
        vertexNode.neighbors.add( self );
    };
}

function VertexGraph( positions, precisionPoints ) {
    var self = this;

    self.verticesMap = {}; // map of { vertexKey -> vertexNode }

    self.vertexForPosition = function(posIndex) {
        return self.verticesMap[ keyForTrio(positions, posIndex, precisionPoints) ];
    };

    // Iterate position array to create the graph
    for (var faceIndex = 0; faceIndex < positions.length; faceIndex += 9) { // a face is 9 positions - 3 vertex x 3 positions

        var verticesOfCurrentFace = [];
        for (var v = 0; v < 3; v++ ) {
            var key = keyForTrio( positions, faceIndex + v*3, precisionPoints );

            if ( ! self.verticesMap.hasOwnProperty(key) ) {
                var vn = new VertexNode();
                self.verticesMap[key] = vn;
            }

            verticesOfCurrentFace.push( self.verticesMap[key] );
        }

        // Since these 3 vertices are on the same face, they are neighbors on the graph
        verticesOfCurrentFace[0].addNeighbor(verticesOfCurrentFace[1]);
        verticesOfCurrentFace[0].addNeighbor(verticesOfCurrentFace[2]);
    }

    self.islands = function() {
        var allIslands = [];

        Object.getOwnPropertyNames( self.verticesMap ).forEach( function( key ) {
            var vertexNode = self.verticesMap[key];

            if (vertexNode.island) {
                return ;
            }

            var newIsland = {};
            self.floodFill(vertexNode, newIsland)
            allIslands.push(newIsland);
        });

        return allIslands;
    };

    self.floodFill = function(start, island) {

        // Breadth-first traversal
        var queue = [];

        // Mark the source node as visited and enqueue it
        queue.unshift(start);
        start.island = island;

        while (queue.length > 0) {

            // Dequeue a vertex from queue and print it
            var v = queue.pop(0);

            // Get all adjacent vertices of the dequeued
            // vertex s. If a adjacent has not been visited,
            // then mark it visited and enqueue it
            v.neighbors.forEach( function( nextV ) {

                if (! nextV.island) {
                    queue.unshift(nextV);
                    nextV.island = island;
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
        var islands = graph.islands();

        islands.forEach( function( island ) {
            island.faceIndices = [];  // List of position indices the faces (the same as position index of 1st vertex of the face) on this island
        });

        for (var faceIndex = 0; faceIndex < originalPositions.length; faceIndex += 9) { // a face is 9 positions - 3 vertex x 3 positions
            var islandOfCurrentFace = graph.vertexForPosition(faceIndex).island;
            islandOfCurrentFace.faceIndices.push(faceIndex);
        }

        var geometries = islands.map( function( island ) {

            // Adopted from STLLoader.js
            var geometry = new THREE.BufferGeometry();

            var vertices = [];
            var normals = [];
            var colors = [];

            island.faceIndices.forEach( function( faceIndex ) {

                for (var i = 0; i < 9; i++) {

                    vertices.push( originalPositions[faceIndex + i] );

                    if (originalNormals) {
                        normals.push( originalNormals[faceIndex + i] );
                    }

                    if (originalColors) {
                        colors.push( originalColors[faceIndex + i] );
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
