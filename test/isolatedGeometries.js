import { BufferGeometryAnalyzer, ConnectedBufferGeometry, STLLoader } from '..';
import { expect } from 'chai';
import fs from 'fs';

describe("isolatedGeometries", function() {
    let testFile = function (filename, expectedGeometriesCount) {
        let stl = fs.readFileSync("test/" + filename, {encoding: "ascii"});
        let geometry = new STLLoader().parse(stl);
        let newGeometries = BufferGeometryAnalyzer.isolatedGeometries(geometry);
        expect(newGeometries.length).to.equal(expectedGeometriesCount);
    }

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
    });
});
