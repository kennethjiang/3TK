import { BufferGeometryAnalyzer, ConnectedSTL, STLLoader, STLExporter, STLBinaryExporter } from '..';
import { expect } from 'chai';
import fs from 'fs';
import * as THREE from 'three';

describe("ConnectedSTL", function() {
    describe("isolatedBufferGeometries", function() {
        let testFile = function (filename, expectedGeometriesCount, writeShapes = true) {
            // Test that the number of shapes is as expected.
            let stl = fs.readFileSync("test/" + filename + ".stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedSTL = new ConnectedSTL().fromBufferGeometry(geometry);
            let newGeometries = connectedSTL.isolatedBufferGeometries(geometry);
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
            let oldFaceCount = connectedSTL.positions.length/9;
            let splits = connectedSTL.splitFaces(new THREE.Plane(
                new THREE.Vector3(1,0,0), -((boundingBox.max.x*2 + boundingBox.min.x)/3)));

            if (writeShapes) {
                let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
                let obj = new THREE.Object3D();
                obj.add(mesh);
                fs.writeFileSync(filename + "_split.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
            }
            expect(splits.size).to.be.greaterThan(0);
            let newFaceCount = connectedSTL.positions.length/9;
            // Splitting an edge affects two faces.
            expect(newFaceCount).to.be.greaterThan(oldFaceCount);
            let oldNeighbors = connectedSTL.neighbors.slice(0);
            connectedSTL.neighbors = [];
            connectedSTL.reverseIslands = [];
            expect(connectedSTL.findNeighbors()).to.be.true;
            let newNeighbors = connectedSTL.neighbors.slice(0);
            // neighbors array should have be updated correctly during split.
            expect(newNeighbors).to.have.ordered.members(oldNeighbors);

            // Spliting should not affect the number of shapes.
            newGeometries = connectedSTL.isolatedBufferGeometries(geometry);
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
            connectedSTL.mergeFaces();
            if (writeShapes) {
                let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
                let obj = new THREE.Object3D();
                obj.add(mesh);
                fs.writeFileSync(filename + "_merged.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
            }

            expect(newGeometries.length).to.equal(expectedGeometriesCount);

            connectedSTL.collapse(new THREE.Plane(
                new THREE.Vector3(1,0,0), -((boundingBox.max.x + boundingBox.min.x*2)/3)));
            connectedSTL.mergeFaces();
            if (writeShapes) {
                let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
                let obj = new THREE.Object3D();
                obj.add(mesh);
                fs.writeFileSync(filename + "_collapsed.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
            }
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
            this.timeout(0);
            let stl = fs.readFileSync("test/egg.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedSTL = new ConnectedSTL().fromBufferGeometry(geometry);
            //expect(connectedSTL).to.be.null;
            connectedSTL.fixHoles();
            let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
            let obj = new THREE.Object3D();
            obj.add(mesh);
            fs.writeFileSync("egg_repaired.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
        });

        it("dino jump just merge", function () {
            this.timeout(30000);
            let stl = fs.readFileSync("test/DINOSAUR_JUMP.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedSTL = new ConnectedSTL().fromBufferGeometry(geometry);
            connectedSTL.mergeFaces(function (v0, v1) {
                return v0.angleTo(v1) < Math.PI/180*20;
            });
            let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
            let obj = new THREE.Object3D();
            obj.add(mesh);
            fs.writeFileSync("DINOSAUR_JUMP_merged.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
        });

        it("retriangle", function () {
            this.timeout(30000);
            let stl = fs.readFileSync("test/lungo.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedSTL = new ConnectedSTL().fromBufferGeometry(geometry);
            connectedSTL.mergeFaces();
            connectedSTL.retriangle(
                Array.from(new Array(connectedSTL.positions.length/9).keys()));
            let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
            let obj = new THREE.Object3D();
            obj.add(mesh);
            fs.writeFileSync("lungo_retriangle.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
        });
    });
});
