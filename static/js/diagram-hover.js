/* Secure Chat case study: hover-highlight for the three hand-drawn diagrams (Architecture,
   Router/Room Topology, Direct-Message Flow). Hovering (or keyboard-focusing) a node lights
   up every edge attached to it and dims the rest — the same interaction the source
   ChatAppDiagram repo built with dagre-d3's own graph object, reapplied here with d3
   directly against the plain <path data-from>/<data-to> attributes now that the diagrams
   are hand-positioned SVGs rather than an auto-laid-out graph. */
(function () {
    'use strict';
    if (!window.d3) return;

    document.querySelectorAll('.case-diagram-svg').forEach(function (svgEl) {
        var svg = d3.select(svgEl);
        var edges = svg.selectAll('.e');

        function lightUp(nodeId) {
            edges.classed('lit', function () {
                var el = this;
                return el.getAttribute('data-from') === nodeId || el.getAttribute('data-to') === nodeId;
            });
            svgEl.classList.add('has-lit');
        }

        function clear() {
            edges.classed('lit', false);
            svgEl.classList.remove('has-lit');
        }

        svg.selectAll('.dnode').each(function () {
            var node = d3.select(this);
            var id = this.getAttribute('data-id');
            node.on('mouseenter', function () { lightUp(id); });
            node.on('mouseleave', clear);
            node.on('focus', function () { lightUp(id); });
            node.on('blur', clear);
        });
    });
})();
