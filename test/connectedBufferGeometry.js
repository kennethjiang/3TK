import { BufferGeometryAnalyzer, ConnectedBufferGeometry, STLLoader, STLExporter, STLBinaryExporter } from '..';
import { expect } from 'chai';
import fs from 'fs';
import * as THREE from 'three';

describe("ConnectedBufferGeometry", function() {
    describe("isolatedBufferGeometries", function() {
        let testFile = function (filename, expectedGeometriesCount) {
            let stl = fs.readFileSync("test/" + filename, {encoding: "ascii"});
            let geometry = new STLLoader().parse(stl);
            let connectedBufferGeometry = new ConnectedBufferGeometry().fromBufferGeometry(geometry);
            let newGeometries = connectedBufferGeometry.isolatedBufferGeometries(geometry);
            expect(newGeometries.length).to.equal(expectedGeometriesCount);

            connectedBufferGeometry.splitFaces(new THREE.Plane(new THREE.Vector3(1,0,0), -5));
            let oldNeighbors = connectedBufferGeometry.neighbors.slice(0);
            connectedBufferGeometry.neighbors = [];
            connectedBufferGeometry.findNeighbors();
            let newNeighbors = connectedBufferGeometry.neighbors.slice(0);
            expect([1,2,3]).to.have.ordered.members([1,2,3]);
            expect(oldNeighbors).to.have.ordered.members(newNeighbors);
            newGeometries = connectedBufferGeometry.isolatedBufferGeometries(geometry);
            // isolating after split should not affect the result.
            expect(newGeometries.length).to.equal(expectedGeometriesCount);
        }

        it("Simple tetrahedron", function() {
            testFile("tetrahedron.stl", 1);
        });

        it("Split simple tetrahedron", function() {
            this.timeout(100000);
            let filename = "DINOSAUR_JUMP.stl";
            let stl = fs.readFileSync("test/" + filename, {encoding: "binary"});
            let geometry = new STLLoader().parse(stl);
            let connectedBufferGeometry = new ConnectedBufferGeometry().fromBufferGeometry(geometry);
            //console.log(connectedBufferGeometry);
            //console.log("original face count: " + connectedBufferGeometry.getAttribute('position').array.length/9);
            //let degeneratesCount = 0;
            //for (let f = 0; f < connectedBufferGeometry.getAttribute('position').array.length/9; f++) {
            //    if (connectedBufferGeometry.isFaceDegenerate(f)) {
            //        degeneratesCount++;
            //    }
            //}
            //console.log("degenerates: " + degeneratesCount);
            //console.log("degenerates created: " + connectedBufferGeometry.mergeFaces());
            connectedBufferGeometry.splitFaces(new THREE.Plane(new THREE.Vector3(1,0,0), -619));
            //console.log("new face count: " + connectedBufferGeometry.getAttribute('position').array.length/9);
            //console.log("degenerates created: " + connectedBufferGeometry.mergeFaces());
            
            let mesh = new THREE.Mesh(connectedBufferGeometry);
            let obj = new THREE.Object3D();
            obj.add(mesh);
            fs.writeFileSync("new_tetra1.stl", new Buffer(new STLExporter().parse(obj)), 'binary');
        });
/*
        it("Split ruler with degenerate facets", function() {
            testFile("lungo.stl", 2);
        });

        it("2 tetrahedrons that share a face", function() {
            testFile("face_connected_tetrahedrons.stl", 2);
        });

        it("2 tetrahedrons that share an edge", function() {
            testFile("edge_connected_tetrahedrons.stl", 2);
        });

        it("27 cubes in 3 by 3 by 3 formation", function() {
            testFile("rubix.stl", 27);
        });

        it("27 cubes in 3 by 3 by 3 formation on an angle", function() {
            testFile("twisted_rubix.stl", 27);
        });

        it("27 cubes in 3 by 3 by 3 formation with facets in lightly shuffled order", function() {
            testFile("shuffled_rubix.stl", 27);
        });

        it("Big object: Dinosaur Jump", function() {
            this.timeout(10000);
            testFile("DINOSAUR_JUMP.stl", 1);
        });*/
    });
});
