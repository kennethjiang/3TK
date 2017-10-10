import { BufferGeometryAnalyzer, ConnectedBufferGeometry, STLLoader, STLExporter } from '..';
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
            let filename = "tetrahedron.stl";
            let stl = fs.readFileSync("test/" + filename, {encoding: "ascii"});
            let geometry = new STLLoader().parse(stl);
            let connectedBufferGeometry = new ConnectedBufferGeometry().fromBufferGeometry(geometry);
            console.log(connectedBufferGeometry);
            connectedBufferGeometry.splitFaces(new THREE.Plane(new THREE.Vector3(1,0,0), -1));
            connectedBufferGeometry.mergeFaces();
            
            console.log(connectedBufferGeometry);
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
