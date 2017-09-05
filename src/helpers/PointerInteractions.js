/**
 * @author kennethjiang / https://github.com/kennethjiang
 *
 */

import * as THREE from 'three'

// objects: Array of object3D that you want to be selectable by mouse clicks or touch guesture
// domElement: DomElement of the render
// camera: camera of the scene
// recursive: should intersect sub-objects recursively? Default to false
//
function PointerInteractions( domElement, camera, recursive ) {

    var scope = this;
    scope.objects = [];
    scope.hoveredObject = null;
    scope.clickedObject = null;
    scope.draggedObject = null;
    scope.recursive = recursive === 'undefined' ? false : recursive ;

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

    scope.dispose = function () {

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

    scope.update = function () {

        // reset corresponding field if the referenced object has been removed from the list
        var allObjects = [];
        for (var obj of scope.objects) {
            obj.traverse( function( child ) { allObjects.push( child ); } );
        }

        for ( var prop of [ "hoveredObject", "clickedObject", "draggedObject" ] ) {

            if ( allObjects.indexOf( scope[prop] ) < 0 ) scope[prop] = null;

        }

    }

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

        var obj = insertedObject(event);

        if (pointerDepressed) {

            if ( scope.draggedObject != obj ) {
                const prevObj = scope.draggedObject;
                scope.draggedObject = obj;
                scope.dispatchEvent( { type: 'drag', previous: prevObj, current: obj } );
            }

        } else {

            if ( scope.hoveredObject != obj ) {
                const prevObj = scope.hoveredObject;
                scope.hoveredObject = obj;
                scope.dispatchEvent( { type: 'hover', previous: prevObj, current: obj } );
            }

        }

    }

    function onPointerUp( event ) {

        if (!pointerDepressed) return ;
        pointerDepressed = false;

        if (lastPointerEvent != "pointerdown") return ; // A click is a pointerdown followed immediately by a pointerup
        lastPointerEvent = "pointerup";

        var obj = insertedObject(event);
        const prevObj = scope.clickedObject;
        scope.clickedObject = obj;
        scope.dispatchEvent( { type: 'click', previous: prevObj, current: obj } );

    }

    function onPointerOut( event ) {

        lastPointerEvent = "pointerout";

        if (pointerDepressed)  {
            const prevObj = scope.draggedObject;
            scope.draggedObject= null;
            scope.dispatchEvent( { type: 'drag', previous: prevObj, current: null } );

        } else {
            const prevObj = scope.hoveredObject;
            scope.hoveredObject = null;
            scope.dispatchEvent( { type: 'hover', previous: prevObj, current: null } );

        }

    }

    function insertedObject( event ) {

        if ( event.button !== undefined && event.button !== 0 ) return;

        var pointer = event.changedTouches ? event.changedTouches[ 0 ] : event;
        var rect = domElement.getBoundingClientRect();
        var x = ( pointer.clientX - rect.left ) / rect.width;
        var y = ( pointer.clientY - rect.top ) / rect.height;
        pointerVector.set( ( x * 2 ) - 1, - ( y * 2 ) + 1 );

        ray.setFromCamera( pointerVector, camera );

        var intersections = ray.intersectObjects( scope.objects, scope.recursive );
        return intersections[ 0 ] ? intersections[ 0 ].object : null;

    }

}

PointerInteractions.prototype = Object.create( THREE.EventDispatcher.prototype );
PointerInteractions.prototype.constructor = PointerInteractions;

export { PointerInteractions }
