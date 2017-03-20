/**
 * @author kennethjiang / https://github.com/kennethjiang
 *
 */

import * as THREE from 'three'

// objects: Array of object3D that you want to be selectable by mouse clicks or touch guesture
// domElement: DomElement of the render
// camera: camera of the scene
// selectionChanged: Callback when object selection(s) change
//
function PointerInteractions( objects, domElement, camera, objectClicked, objectHovered) {

    var scope = this;
    scope.objects = objects;
    scope.clickedObject = null;
    scope.hoveredObject = null;

	//
	// public attributes and methods
	//

    domElement.addEventListener( "mousedown", onPointerDown, false );
    domElement.addEventListener( "touchstart", onPointerDown, false );

    domElement.addEventListener( "mousemove", onPointerMove, false );
    domElement.addEventListener( "touchmove", onPointerMove, false );

    domElement.addEventListener( "mouseup", onPointerUp, false );
    domElement.addEventListener( "touchend", onPointerUp, false );
    domElement.addEventListener( "touchcancel", onPointerUp, false );

    domElement.addEventListener( "mouseout", onPointerOut, false );
    domElement.addEventListener( "touchleave", onPointerOut, false );

    this.dispose = function () {

        domElement.removeEventListener( "mousedown", onPointerDown );
        domElement.removeEventListener( "touchstart", onPointerDown );

        domElement.removeEventListener( "mousemove", onPointerMove );
        domElement.removeEventListener( "touchmove", onPointerMove );

        domElement.removeEventListener( "mouseup", onPointerUp );
        domElement.removeEventListener( "touchend", onPointerUp );
        domElement.removeEventListener( "touchcancel", onPointerUp );

        domElement.removeEventListener( "mouseout", onPointerOut );
        domElement.removeEventListener( "touchleave", onPointerOut );

    };

	//
	// internals
	//

    var pointerVector = new THREE.Vector2();
    var ray = new THREE.Raycaster();
    ray.linePrecision = 0.01;

    var pointerDepressed = false;
    var lastPointerEvent;

	function onPointerDown( event ) {

        lastPointerEvent = "pointerdown";

        pointerDepressed = true;

    }

    function onPointerMove( event ) {

        lastPointerEvent = "pointermove";

        if (pointerDepressed) return ;

        if (! objectHovered ) return;

        var obj = insertedObject(event);
        if ( scope.hoveredObject != obj ) {
            objectHovered( obj, scope.hoveredObject );
        }

        scope.hoveredObject = obj;
    }

    function onPointerUp( event ) {

        if (!pointerDepressed) return ;
        pointerDepressed = false;

        if (lastPointerEvent != "pointerdown") return ; // A click is a pointerdown followed immediately by a pointerup
        lastPointerEvent = "pointerup";

        if (! objectClicked ) return ;

        var obj = insertedObject(event);
        if ( scope.clickedObject != obj ) {
            objectClicked( obj, scope.clickedObject );
        }

        scope.clickedObject = obj;

    }

    function onPointerOut( event ) {

        lastPointerEvent = "pointerout";

        if (pointerDepressed) return ;

        if (! objectHovered ) return;

        objectHovered( null, scope.hoveredObject );

        scope.hoveredObject = null;

    }

    function insertedObject( event ) {

        if ( event.button !== undefined && event.button !== 0 ) return;

        var pointer = event.changedTouches ? event.changedTouches[ 0 ] : event;
        var rect = domElement.getBoundingClientRect();
        var x = ( pointer.clientX - rect.left ) / rect.width;
        var y = ( pointer.clientY - rect.top ) / rect.height;
        pointerVector.set( ( x * 2 ) - 1, - ( y * 2 ) + 1 );

        ray.setFromCamera( pointerVector, camera );

        var intersections = ray.intersectObjects( objects, false );
        return intersections[ 0 ] ? intersections[ 0 ].object : null;

    }

}

PointerInteractions.prototype = Object.create( THREE.EventDispatcher.prototype );
PointerInteractions.prototype.constructor = PointerInteractions;

export { PointerInteractions }
