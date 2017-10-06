import { ConnectedBufferGeometry, STLLoader } from '..';
import * as THREE from 'three';
import { expect } from 'chai';
import fs from 'fs';

describe("connectedBufferGeometry", function() {
    it("Constructor", function() {
        let stl = fs.readFileSync("test/lungo.stl", {encoding: "ascii"});
        let geometry = new STLLoader().parse(stl);
        let x = new ConnectedBufferGeometry().fromBufferGeometry(geometry);
        console.log(x);
    });
});
