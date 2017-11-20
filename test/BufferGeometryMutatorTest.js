import { BufferGeometryAnalyzer, BufferGeometryMutator, STLLoader, STLExporter, STLBinaryExporter } from '..';
import { expect } from 'chai';
import fs from 'fs';
import * as THREE from 'three';


// Tests of BufferGeometryMutator.  To run:
// npm test
// To run with large tests and also write outputs:
// env INCLUDE_LARGE_TESTS=1 WRITE_TEST_OUTPUTS=1 npm test
// To run just the cubes tests:
// npm test -- --grep "cubes"
// To run just the Big test with chome://inspect debugger:
// env INCLUDE_LARGE_TESTS=1 npm test -- "--grep" "Big" --inspect --debug-brk

const equalNormals = function (v0, v1) {
    return v0.angleTo(v1) < Math.PI/180*0.0001;
};
describe("BufferGeometryMutator", function() {
    describe("isolatedBufferGeometries", function() {
        let testFile = function (filename, expectedGeometriesCount, writeShapes = process.env.WRITE_TEST_OUTPUTS) {
            // Test that the number of shapes is as expected.
            let stl = fs.readFileSync("test/data/" + filename + ".stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedSTL = new BufferGeometryMutator().fromBufferGeometry(geometry);
            let newGeometries = Array.from(connectedSTL.isolate()).map((x) => x.bufferGeometry());
            expect(newGeometries.length).to.equal(expectedGeometriesCount);
            if (writeShapes) {
                for (let i = 0; i < newGeometries.length; i++) {
                    let mesh = new THREE.Mesh(newGeometries[i]);
                    let obj = new THREE.Object3D();
                    obj.add(mesh);
                    fs.writeFileSync(filename + "_old" + i + ".stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
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
            newGeometries = Array.from(connectedSTL.isolate()).map((x) => x.bufferGeometry());
            if (writeShapes) {
                for (let i = 0; i < newGeometries.length; i++) {
                    let mesh = new THREE.Mesh(newGeometries[i]);
                    let obj = new THREE.Object3D();
                    obj.add(mesh);
                    fs.writeFileSync(filename + "_new" + i + ".stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
                }
            }
            expect(newGeometries.length).to.equal(expectedGeometriesCount);

            // Merging faces should not affect the number of shapes.
            connectedSTL.mergeFaces(equalNormals);
            if (writeShapes) {
                let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
                let obj = new THREE.Object3D();
                obj.add(mesh);
                fs.writeFileSync(filename + "_merged.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
            }

            expect(newGeometries.length).to.equal(expectedGeometriesCount);

            let newBufferGeometryMutators = connectedSTL.chop(new THREE.Plane(
                new THREE.Vector3(1,0,0), -((boundingBox.max.x + boundingBox.min.x*3)/4)));
            for (let i = 0; i < newBufferGeometryMutators.length; i++) {
                let newBufferGeometryMutator = newBufferGeometryMutators[i];
                newBufferGeometryMutator.mergeFaces(equalNormals);
                newBufferGeometryMutator.retriangle(Array.from(new Array(newBufferGeometryMutator.positions.length/9).keys()), equalNormals);
                if (writeShapes) {
                    let mesh = new THREE.Mesh(newBufferGeometryMutator.bufferGeometry());
                    let obj = new THREE.Object3D();
                    obj.add(mesh);
                    fs.writeFileSync(filename + "_chop" + i + ".stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
                    newGeometries = Array.from(connectedSTL.isolate()).map((x) => x.bufferGeometry());
                    for (let j = 0; j < newGeometries.length; j++) {
                        let mesh = new THREE.Mesh(newGeometries[j]);
                        let obj = new THREE.Object3D();
                        obj.add(mesh);
                        fs.writeFileSync(filename + "_new" + i + "_" + j + ".stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
                    }
                }
            }
        }

        it("Plus", function() {
            testFile("plus", 1);
        });

        it("Hollow Cube", function() {
            // We'd prefer this to be just 1 object.
            testFile("hollow_cube", 2);
        });

        it("Cup", function() {
            testFile("cup", 1);
        });

        it("Stairs", function() {
            testFile("stairs", 1);
        });

        it("Crescent", function() {
            testFile("crescent", 1);
        });

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

        it("egg shape with lots of faces", function() {
            this.timeout(0);
            testFile("egg", 1);
        });

        it("non-manifold egg with a side sliced off and a hole", function() {
            this.timeout(0);
            testFile("egg_chopped", 1);
        });

        it("Big object: Dinosaur Jump", function() {
            if (!process.env.INCLUDE_LARGE_TESTS) {
                this.skip();
            }
            this.timeout(0);
            testFile("DINOSAUR_JUMP", 1);
        });

        it("Non-manifold egg just fixHoles", function () {
            if (!process.env.INCLUDE_LARGE_TESTS) {
                this.skip();
            }
            this.timeout(0);
            let stl = fs.readFileSync("test/data/egg_with_holes.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedSTL = new BufferGeometryMutator().fromBufferGeometry(geometry);
            connectedSTL.fixHoles();
            let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
            let obj = new THREE.Object3D();
            obj.add(mesh);
            fs.writeFileSync("egg_with_holes_repaired.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
        });

        it("dino jump just merge", function () {
            if (!process.env.INCLUDE_LARGE_TESTS) {
                this.skip();
            }
            this.timeout(30000);
            let stl = fs.readFileSync("test/data/DINOSAUR_JUMP.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedSTL = new BufferGeometryMutator().fromBufferGeometry(geometry);
            connectedSTL.mergeFaces(function (v0, v1) {
                return v0.angleTo(v1) < Math.PI/180*2;
            });
            let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
            let obj = new THREE.Object3D();
            obj.add(mesh);
            fs.writeFileSync("DINOSAUR_JUMP_merged.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
        });

        it("dino jump just retriangle", function () {
            if (!process.env.INCLUDE_LARGE_TESTS) {
                this.skip();
            }
            this.timeout(30000);
            let stl = fs.readFileSync("test/data/DINOSAUR_JUMP.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedSTL = new BufferGeometryMutator().fromBufferGeometry(geometry);
            connectedSTL.retriangle(
                Array.from(new Array(connectedSTL.positions.length/9).keys()));
            let mesh = new THREE.Mesh(connectedSTL.bufferGeometry());
            let obj = new THREE.Object3D();
            obj.add(mesh);
            fs.writeFileSync("DINOSAUR_JUMP_retriangle.stl", new Buffer(new STLExporter().parse(obj)), 'ascii');
        });

        it("dino jump just chop", function () {
            if (!process.env.INCLUDE_LARGE_TESTS) {
                this.skip();
            }
            this.timeout(0);
            let stl = fs.readFileSync("test/data/DINOSAUR_JUMP.stl", {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            geometry.computeBoundingBox();
            let boundingBox = geometry.boundingBox;
            let connectedSTL = new BufferGeometryMutator().fromBufferGeometry(geometry);
            let newBufferGeometryMutators = connectedSTL.chop(new THREE.Plane(
                new THREE.Vector3(1,0,0), -((boundingBox.max.x + boundingBox.min.x*3)/4)));
        });
    });
});
