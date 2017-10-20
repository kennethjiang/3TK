import { BufferGeometryAnalyzer, ConnectedSTL, STLLoader, STLExporter, STLBinaryExporter } from '..';
import { expect } from 'chai';
import fs from 'fs';
import * as THREE from 'three';

describe("ConnectedSTL", function() {
    describe("isolatedBufferGeometries", function() {
        let testFile = function (filename, expectedGeometriesCount, writeShapes = false) {
            // Test that the number of shapes is as expected.
            let stl = fs.readFileSync("test/" + filename + ".stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedBufferGeometry = new ConnectedSTL().fromBufferGeometry(geometry);
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
                new THREE.Vector3(1,0,0), -((boundingBox.max.x*2 + boundingBox.min.x)/3)));

            if (writeShapes) {
                let mesh = new THREE.Mesh(connectedBufferGeometry.bufferGeometry());
                let obj = new THREE.Object3D();
                obj.add(mesh);
                fs.writeFileSync(filename + "_split.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
            }
            expect(splits).to.be.greaterThan(0);
            let newFaceCount = connectedBufferGeometry.positions.length/9;
            // Splitting an edge affects two faces.
            expect(newFaceCount).to.equal(oldFaceCount+splits*2);
            let oldNeighbors = connectedBufferGeometry.neighbors.slice(0);
            connectedBufferGeometry.neighbors = [];
            connectedBufferGeometry.reverseIslands = [];
            expect(connectedBufferGeometry.findNeighbors()).to.be.true;
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

            // Merging faces should not affect the number of shapes.
            connectedBufferGeometry.mergeFaces();
            if (writeShapes) {
                let mesh = new THREE.Mesh(connectedBufferGeometry.bufferGeometry());
                let obj = new THREE.Object3D();
                obj.add(mesh);
                fs.writeFileSync(filename + "_merged.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
            }

            expect(newGeometries.length).to.equal(expectedGeometriesCount);
        }

        it("Simple tetrahedron", function() {
            testFile("tetrahedron", 1);
        });

        it("Split ruler with degenerate facets", function() {
            testFile("lungo", 2);
        });

        it("2 tetrahedrons that share a face", function() {
            testFile("face_connected_tetrahedrons", 2);
        });

        it("2 tetrahedrons that share an edge", function() {
            testFile("edge_connected_tetrahedrons", 2);
        });

        it("27 cubes in 3 by 3 by 3 formation", function() {
            testFile("rubix", 27);
        });

        it("27 cubes in 3 by 3 by 3 formation on an angle", function() {
            testFile("twisted_rubix", 27);
        });

        it("27 cubes in 3 by 3 by 3 formation with facets in lightly shuffled order", function() {
            testFile("shuffled_rubix", 27);
        });

        it("Big object: Dinosaur Jump", function() {
            this.timeout(40000);
            testFile("DINOSAUR_JUMP", 1);
        });

        it("Non-manifold object", function () {
            let stl = fs.readFileSync("test/tetrahedron_non_manifold.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedBufferGeometry = new ConnectedSTL().fromBufferGeometry(geometry);
            expect(connectedBufferGeometry).to.be.null;
        });

        it("dino jump just merge", function () {
            this.timeout(30000);
            let stl = fs.readFileSync("test/DINOSAUR_JUMP.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedBufferGeometry = new ConnectedSTL().fromBufferGeometry(geometry);
            console.log("faces merged: " + connectedBufferGeometry.mergeFaces(function (v0, v1) {
                return v0.angleTo(v1) < Math.PI/180*20;
            }));
            let mesh = new THREE.Mesh(connectedBufferGeometry.bufferGeometry());
            let obj = new THREE.Object3D();
            obj.add(mesh);
            fs.writeFileSync("DINOSAUR_JUMP_merged.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
        });

    });
});