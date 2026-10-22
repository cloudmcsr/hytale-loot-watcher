// loot_chance.js — standalone, generic loot-chance evaluator.
//
// Semantics (formal, type-agnostic — not derived from any observed case):
//   * A loot definition is a TREE of nodes. A node may carry:
//       Type        "Single" | "Empty" | "Choice" | "Multiple" | "Droplist"
//                   | anything else (generic fallback, see below)
//       Weight      consumed EXACTLY ONCE, owned by the parent context:
//                     - under a Choice: relative share among siblings;
//                     - under a Multiple: that subtree's independent gate,
//                       interpreted as a probability out of 100;
//                     - at the root (no consuming parent): the node's own
//                       gate, probability out of 100.
//       RollsMin/RollsMax (Choice): K independent picks; a member's chance
//                   of appearing at least once is E[1-(1-p)^K], K uniform
//                   integer on [RollsMin..RollsMax] (exact expectation; a
//                   fixed count is the K=min==max special case; no range
//                   means K=1).
//       Item/QuantityMin/QuantityMax  (Single leaf payload)
//       DroplistId  (Droplist: resolved via a lookup callback; the subtree
//                   is evaluated at the same composed chance)
//       Containers  (Choice: members; Multiple: parallel entries)
//       Container   (transparent single-child wrapper)
//       arrays      (transparent sibling groups)
//   * A node's own Weight is NEVER applied twice: once a parent consumes a
//     child's Weight (as share, gate or pass factor) it is not re-applied
//     inside that child's own evaluation.
//   * Unknown Types degrade generically and never throw: a node with
//     Containers is treated Multiple-style (independent gated children);
//     a node without Containers is treated as a plain leaf at the composed
//     chance.
//   * The evaluator produces a chance-ANNOTATED tree:
//         { kind, node, chance, trigger, children|child, memberP }
//     The renderer (renderLootGrid in script.js) walks annotations and only
//     decides presentation. Chance math lives nowhere else.
//
// Batch P (2026-10-22): extracted from script.js per user request #47-49
// ("weight calculation for Multiple rolls", "unit tests for every container
// type and deep nesting", "fully modular or agnostic").

window.LootChance = (function () {
    'use strict';

    // --- roll-count plumbing -------------------------------------------------

    // Normalized roll range of a Choice node: {min, max} inclusive integers,
    // or null when the node specifies no range (=> a single pick).
    function rollRange(node) {
        var hasMin = node.RollsMin !== undefined && node.RollsMin !== null;
        var hasMax = node.RollsMax !== undefined && node.RollsMax !== null;
        if (!hasMin && !hasMax) return null;
        var min = hasMin ? node.RollsMin : (hasMax ? node.RollsMax : 1);
        var max = hasMax ? node.RollsMax : min;
        min = Math.max(0, Math.round(Number(min) || 0));
        max = Math.max(0, Math.round(Number(max) || 0));
        if (max < min) { var t = min; min = max; max = t; }  // tolerate swapped input
        return { min: min, max: max };
    }

    // Exact expected probability that an event of per-pick probability p
    // occurs at least once, over K uniform-integer picks on [min..max].
    // min/max undefined => fixed count implied by the other bound, else 1.
    function atLeastOnce(p, min, max) {
        if (p <= 0) return 0;
        if (p >= 1) return 1;
        var kMin = (min === undefined || min === null) ? 1 : Math.max(0, Math.round(min));
        var kMax = (max === undefined || max === null) ? (min === undefined || min === null ? 1 : kMin) : Math.max(kMin, Math.round(max));
        if (kMax === kMin) return 1 - Math.pow(1 - p, kMin);
        var acc = 0, n = kMax - kMin + 1;
        for (var k = kMin; k <= kMax; k++) acc += 1 - Math.pow(1 - p, k);
        return acc / n;
    }

    function weightFactor(node, mode) {
        // mode 'independent' (Multiple children / roots): Weight/100
        // method 'share' never routes here (share math needs the sum).
        if (mode !== 'independent') return 1;
        return node && node.Weight !== undefined && node.Weight !== null ? node.Weight / 100 : 1;
    }

    // --- annotation walk -----------------------------------------------------

    // annotate(node, parentChance, selfFactor, resolver)
    //   parentChance: composed upstream probability for this subtree
    //   selfFactor:   multiplier already consumed by the parent for THIS node
    //                 (1 when the parent consumed nothing / passed a share via
    //                 the cond path; at the ROOT undefined => the node's own
    //                 Weight gates itself as Weight/100)
    //   resolver:     (droplistId) => loot-table definition node, or null/undefined
    function annotate(node, parentChance, selfFactor, resolver) {
        if (node === undefined || node === null) return null;
        if (typeof parentChance !== 'number' || !isFinite(parentChance)) parentChance = 1;
        var isRoot = (selfFactor === undefined || selfFactor === null);
        if (Array.isArray(node)) {
            // transparent sibling group: each element evaluated root-like
            // (its own Weight, if any, gates that element)
            var sibs = [];
            for (var i = 0; i < node.length; i++) sibs.push(annotate(node[i], parentChance, undefined, resolver));
            return { kind: 'group', transparent: true, node: node, chance: parentChance, children: sibs };
        }
        if (node.Container !== undefined && node.Container !== null) {
            return annotate(node.Container, parentChance, selfFactor, resolver);
        }
        var factor = isRoot ? weightFactor(node, 'independent') : selfFactor;
        var chanceHere = parentChance * factor;
        var type = node.Type;

        if (type === 'Multiple') {
            return annotateMultiple(node, chanceHere, resolver);
        }
        if (type === 'Choice') {
            return annotateChoice(node, parentChance, factor, resolver);
        }
        if (type === 'Droplist') {
            var def = null;
            if (typeof resolver === 'function') {
                try { def = resolver(node.DroplistId); } catch (e) { def = null; }
            }
            return {
                kind: 'droplist', node: node, chance: chanceHere, trigger: factor,
                child: def !== undefined && def !== null ? annotate(def, chanceHere, undefined, resolver) : null
            };
        }
        // Leaves and anything unknown: Single/Empty/no-Type pass through with
        // the composed chance. Unknown containers without Containers key fall
        // here too (they simply render/evaluate as leaves).
        if (type === 'Single') return { kind: 'single', node: node, chance: chanceHere };
        if (type === 'Empty') return { kind: 'empty', node: node, chance: chanceHere };
        if (node.Containers) {
            // unknown container-ish type: Multiple-style gated children
            return annotateMultiple(node, chanceHere, resolver);
        }
        return { kind: type ? String(type).toLowerCase() : 'leaf', node: node, chance: chanceHere, trigger: undefined };
    }

    function annotateChoice(node, parentChance, triggerFactor, resolver) {
        var members = Array.isArray(node.Containers) ? node.Containers : [];
        var sum = 0;
        for (var i = 0; i < members.length; i++) sum += (members[i] && members[i].Weight !== undefined && members[i].Weight !== null) ? members[i].Weight : 0;
        var range = rollRange(node);
        var trigger = triggerFactor; // unconsumed own gate (only at root/wrapped roots it is not 1)
        var children = [];
        for (var j = 0; j < members.length; j++) {
            var c = members[j];
            var p = sum > 0 && c && c.Weight !== undefined && c.Weight !== null ? c.Weight / sum : 0;
            // parity with the legacy renderer: a Choice whose members carry no
            // weights at all passes its chance through to every member
            var atLeast = sum > 0 ? atLeastOnce(p, range ? range.min : undefined, range ? range.max : undefined) : 1;
            // member Weight consumed HERE as the relative share -> pass selfFactor 1;
            // the choice's own (unconsumed) gate factor multiplies the whole row once
            children.push(annotate(c, parentChance * triggerFactor * atLeast, 1, resolver));
        }
        return { kind: 'choice', node: node, chance: parentChance, trigger: trigger, children: children, memberSum: sum };
    }

    function annotateMultiple(node, chanceHere, resolver) {
        var entries = Array.isArray(node.Containers) ? node.Containers : [];
        var children = [];
        for (var i = 0; i < entries.length; i++) {
            // child's Weight (any type) = its independent gate; consumed HERE
            var gate = weightFactor(entries[i], 'independent');
            children.push(annotate(entries[i], chanceHere * gate, 1, resolver));
        }
        return { kind: 'multiple', node: node, chance: chanceHere, children: children };
    }

    // --- public --------------------------------------------------------------

    // Tags every annotation object so the renderer can tell annotated trees
    // from raw loot definitions without ambiguity.
    function markAnn(a) {
        if (!a || typeof a !== 'object') return;
        a.__lootAnn = true;
        if (a.children) a.children.forEach(markAnn);
        if (a.child) markAnn(a.child);
    }

    return {
        annotate: function (rootNode, options) {
            options = options || {};
            var tree = annotate(rootNode, 1, undefined, options.resolveDroplist || null);
            markAnn(tree);
            return tree;
        },
        // exported for tests
        _internals: { rollRange: rollRange, atLeastOnce: atLeastOnce, weightFactor: weightFactor }
    };
})();
