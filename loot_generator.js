// loot_generator.js — faithful port of the game server's loot generation.
//
// Source of truth: Server_Sourcecode (decompiled HytaleServer.jar),
// package com.hypixel.hytale.server.core.asset.type.item.config(.container):
//   ItemDropContainer      base: weight defaults to 100 (codec default);
//                          root populateDrops is called directly by every
//                          entry point (ItemModule.getRandomItemDrops,
//                          BlockHarvestUtils.getDrops, DroplistCommand,
//                          NPC drop actions) -> a root Weight is dead data.
//   ChoiceItemDropContainer: count = rollsMin + (int)(rnd*(rollsMax-rollsMin+1))
//                          [uniform on min..max]; per roll exactly ONE member
//                          picked via WeightedMap cumulative pick with
//                          probability weight/sum.
//   MultipleItemDropContainer: count = (int)MathUtil.fastRound(rnd*(max-min)+min)
//                          (fastRound = floor(x+0.5)); per count iteration
//                          EVERY child fires if child.weight >= rnd*100
//                          (independent gate, fresh random per child).
//   SingleItemDropContainer: unconditional inside its chain; ItemDrop.
//                          getRandomQuantity = uniform [min..max] (defaults
//                          1..1); the caller requires amount > 0.
//   EmptyItemDropContainer: adds nothing.
//   DroplistItemDropContainer: resolves the referenced ItemDropList per
//                          populate run with a visited-Set guard (root id
//                          pre-seeded); a repeat/cycle reference yields
//                          nothing (second occurrence included).
//   WeightedMap.get(value): cumulative pick over members in order with
//                          clamp min(value, 0.99999) and epsilon threshold
//                          1e-5; degenerate sum=0 => always the FIRST member;
//                          1-member maps are SingletonWeightedMap (always
//                          the member, weight ignored).
//
// The generator consumes chance-ANNOTATED trees (window.LootChance.annotate)
// so callers can pair simulated nodes with predicted chances by object
// identity. The RNG is a caller-supplied seeded PRNG for reproducibility;
// every draw has the same distribution as the server's DoubleSupplier.
//
// Batch Q (2026-10-22): created per user request (generate batches of loot
// for every loot table/drop and test them against the prediction algorithm).

window.LootGenerator = (function () {
    'use strict';

    var PICK_EPSILON = 1e-5;      // WeightedMap ONE_MINUS_EPSILON threshold
    var PICK_CLAMP = 0.99999;     // WeightedMap EPSILON

    // WeightedMap.get: cumulative pick with clamp + epsilon, first-member
    // fallback on a zero-sum pool, singleton pass-through.
    function weightedPick(annChildren, ctx) {
        if (!annChildren || !annChildren.length) return null;
        if (annChildren.length === 1) return annChildren[0];   // SingletonWeightedMap
        var sum = 0;
        var i, w = [];
        for (i = 0; i < annChildren.length; i++) {
            w.push(effWeight(annChildren[i].node));
            sum += w[i];
        }
        var v = Math.min(ctx.rng(), PICK_CLAMP) * sum;
        for (i = 0; i < annChildren.length; i++) {
            v -= w[i];
            if (v <= PICK_EPSILON) return annChildren[i];
        }
        return null;
    }

    function effWeight(node) {
        if (node && node.Weight !== undefined && node.Weight !== null && isFinite(Number(node.Weight))) return Number(node.Weight);
        return 100;   // ItemDropContainer codec default
    }

    // ChoiceItemDropContainer.populateDrops roll count
    function choiceCount(node, rng) {
        var min = node.RollsMin !== undefined && node.RollsMin !== null ? Number(node.RollsMin) : 1;
        var max = node.RollsMax !== undefined && node.RollsMax !== null ? Number(node.RollsMax) : 1;
        return min + Math.floor(rng() * ((max - min) + 1));
    }

    // MathUtil.fastRound = floor(x + 0.5); MultipleItemDropContainer count
    function multipleCount(node, rng) {
        var min = node.MinCount !== undefined && node.MinCount !== null ? Number(node.MinCount) : 1;
        var max = node.MaxCount !== undefined && node.MaxCount !== null ? Number(node.MaxCount) : 1;
        return Math.floor(rng() * (max - min) + min + 0.5);
    }

    // ItemDrop.getRandomQuantity: uniform int on [min..max]
    function randomQuantity(item, rng) {
        var qmin = item.QuantityMin !== undefined && item.QuantityMin !== null ? Number(item.QuantityMin) : 1;
        var qmax = item.QuantityMax !== undefined && item.QuantityMax !== null ? Number(item.QuantityMax) : 1;
        return qmin + Math.floor(rng() * Math.max((qmax - qmin) + 1, 1));
    }

    function populate(ann, ctx) {
        if (!ann) return;
        var i, k, picked;
        switch (ann.kind) {
            case 'group':
                // transparent (Container wrapper / def root array)
                for (i = 0; i < ann.children.length; i++) populate(ann.children[i], ctx);
                return;
            case 'multiple':
                var count = multipleCount(ann.node, ctx.rng);
                for (k = 0; k < count; k++) {
                    for (i = 0; i < ann.children.length; i++) {
                        // server: container.getWeight() >= rnd * 100.0
                        if (effWeight(ann.children[i].node) >= ctx.rng() * 100.0) {
                            populate(ann.children[i], ctx);
                        }
                    }
                }
                return;
            case 'choice':
                var picks = choiceCount(ann.node, ctx.rng);
                for (k = 0; k < picks; k++) {
                    picked = weightedPick(ann.children, ctx);
                    if (picked) populate(picked, ctx);
                }
                return;
            case 'droplist':
                var id = ann.node.DroplistId;
                if (!id || ctx.visited.has(id)) return;   // !references.add(id) || missing
                ctx.visited.add(id);
                populate(ann.child, ctx);
                return;
            case 'single':
                var item = ann.node.Item || {};
                var qty = randomQuantity(item, ctx.rng);
                ctx.events.push({ node: ann, itemId: item.ItemId, qty: qty });
                if (qty > 0 && item.ItemId) ctx.stacks.push({ item: item.ItemId, qty: qty });   // amount > 0 gate
                return;
            case 'empty':
            default:
                // Empty: contributes no item, but the harness observes the
                // "nothing" manifestation as an event (itemId null) so the
                // predicted #nothing chance can be verified statistically.
                if (ann.kind === 'empty') ctx.events.push({ node: ann, itemId: null, qty: 0 });
                return;
        }
    }

    // generate(rootAnn, rootId, rng) -> {events, stacks}
    //   events: configured ItemDrop entries tagged with their annotated node
    //           (pre-quantity; matches the server's populateDrops output)
    //   stacks: the (itemId, qty) pairs that would spawn (amount > 0)
    //   rootId: the table's own id, pre-seeded into the droplist visited-Set
    //           exactly like ItemModule.getRandomItemDrops
    function generate(rootAnn, rootId, rng) {
        var ctx = { rng: rng, visited: new Set(rootId ? [rootId] : []), events: [], stacks: [] };
        populate(rootAnn, ctx);
        return ctx;
    }

    // mulberry32 - small deterministic PRNG (seed -> doubles in [0,1))
    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    return {
        generate: generate,
        mulberry32: mulberry32,
        _internals: { weightedPick: weightedPick, effWeight: effWeight, choiceCount: choiceCount, multipleCount: multipleCount, randomQuantity: randomQuantity }
    };
})();
