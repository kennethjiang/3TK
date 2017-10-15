import { BufferGeometryAnalyzer, ConnectedBufferGeometry, STLLoader, STLExporter, STLBinaryExporter } from '..';
import { expect } from 'chai';
import fs from 'fs';
import * as THREE from 'three';

describe("ConnectedBufferGeometry", function() {
    describe("isolatedBufferGeometries", function() {
        let testFile = function (filename, expectedGeometriesCount, writeShapes = true) {
            // Test that the number of shapes is as expected.
            let stl = fs.readFileSync("test/" + filename, {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedBufferGeometry = new ConnectedBufferGeometry().fromBufferGeometry(geometry);
            let newGeometries = connectedBufferGeometry.isolatedBufferGeometries(geometry);
            expect(newGeometries.length).to.equal(expectedGeometriesCount);
            if (writeShapes) {
                for (let i = 0; i < newGeometries.length; i++) {
                    let mesh = new THREE.Mesh(newGeometries[i]);
                    let obj = new THREE.Object3D();
                    obj.add(mesh);
                    fs.writeFileSync("old" + i + ".stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
                }
            }

            // Split the faces in the shape and check that the
            // neighbors array is maintained correctly.
            geometry.computeBoundingBox();
            let boundingBox = geometry.boundingBox;
            let oldFaceCount = connectedBufferGeometry.positions.length/9;
            let splits = connectedBufferGeometry.splitFaces(new THREE.Plane(
                new THREE.Vector3(1,0,0), -(boundingBox.max.x + boundingBox.min.x)/2));
            expect(splits).to.be.greaterThan(0);
            if (writeShapes) {
                let mesh = new THREE.Mesh(connectedBufferGeometry.bufferGeometry());
                let obj = new THREE.Object3D();
                obj.add(mesh);
                fs.writeFileSync(filename + " _split.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
            }
            let newFaceCount = connectedBufferGeometry.positions.length/9;
            // Splitting an edge affects two faces.
            expect(newFaceCount).to.equal(oldFaceCount+splits*2);
            let oldNeighbors = connectedBufferGeometry.neighbors.slice(0);
            connectedBufferGeometry.neighbors = [];
            connectedBufferGeometry.reverseIslands = [];
            connectedBufferGeometry.findNeighbors();
            let newNeighbors = connectedBufferGeometry.neighbors.slice(0);
            // neighbors array should have be updated correctly during split.
            expect(newNeighbors).to.have.ordered.members(oldNeighbors);

            // Spliting should not affect the number of shapes.
            newGeometries = connectedBufferGeometry.isolatedBufferGeometries(geometry);
            if (writeShapes) {
                for (let i = 0; i < newGeometries.length; i++) {
                    let mesh = new THREE.Mesh(newGeometries[i]);
                    let obj = new THREE.Object3D();
                    obj.add(mesh);
                    fs.writeFileSync("new" + i + ".stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
                }
            }
            expect(newGeometries.length).to.equal(expectedGeometriesCount);
        }
/*
        it("Simple tetrahedron", function() {
            testFile("tetrahedron.stl", 1);
        });

        it("Split ruler with degenerate facets", function() {
            testFile("lungo.stl", 2);
        });

        it("2 tetrahedrons that share a face", function() {
            testFile("face_connected_tetrahedrons.stl", 2);
        });

        it("2 tetrahedrons that share an edge", function() {
            testFile("edge_connected_tetrahedrons.stl", 2);
        });
*/
        it("27 cubes in 3 by 3 by 3 formation", function() {
            testFile("rubix.stl", 27);
        });
/*
        it("27 cubes in 3 by 3 by 3 formation on an angle", function() {
            testFile("twisted_rubix.stl", 27);
        });

        it("27 cubes in 3 by 3 by 3 formation with facets in lightly shuffled order", function() {
            testFile("shuffled_rubix.stl", 27);
        });

        it("Big object: Dinosaur Jump", function() {
            this.timeout(20000);
            testFile("DINOSAUR_JUMP.stl", 1);
        });

        it("Non-manifold object", function () {
            let stl = fs.readFileSync("test/tetrahedron_non_manifold.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedBufferGeometry = new ConnectedBufferGeometry().fromBufferGeometry(geometry);
            expect(connectedBufferGeometry).to.be.null;
        });
*/    });
});
