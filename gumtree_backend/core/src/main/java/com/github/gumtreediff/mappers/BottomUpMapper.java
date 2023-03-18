package com.github.gumtreediff.mappers;

import com.github.gumtreediff.matchers.Mapping;
import com.github.gumtreediff.matchers.MappingStore;
import com.github.gumtreediff.matchers.optimal.rted.RtedMatcher;
import com.github.gumtreediff.tree.Tree;
import com.github.gumtreediff.utils.Pair;

import java.util.ArrayList;
import java.util.List;

public class BottomUpMapper extends AbstractMapper {
    /** Values recommended in the paper. */
    private final double MIN_DICE = 0.5;
    private final int MAX_TREE_SIZE = 100;
    public BottomUpMapper(Tree src, Tree dst, MappingStore mappings) {
        this.src = src;
        this.dst = dst;
        this.mappings = mappings;
    }

    /**
     * Returns a list of mapping candidates for the given node t1.
     * t1 is a node in the src tree; the returned list are nodes in the dst tree.
     * "A node c in T2 is a candidate for t1 if label(t1) = label(c), c is unmatched,
     * and t1 and c have some matching descendants" */
    private List<Tree> calculate_candidates(Tree t1) {
        List<Tree> candidates = new ArrayList<>();
        List<Tree> matched_dst_descendants = new ArrayList<>();

        for (Tree descendant1 : t1.getDescendants()) {
            if (mappings.isSrcMapped(descendant1)) {
                matched_dst_descendants.add(mappings.getDstForSrc(descendant1));
            }
        }

        /* find parent node that has same label as t1 */
        for (Tree dst_descendant : matched_dst_descendants) {
            Tree current = dst_descendant;
            while (current.getParent() != null) {
                Tree parent = current.getParent();
                if (parent.hasSameTypeAndLabel(t1) && !(mappings.isDstMapped(parent)) || parent.isRoot()) {
                    candidates.add(parent);
                }
                current = parent;
            }
        }
        return candidates;
    }
    private boolean src_has_mapped_children(Tree t1) {
        boolean has_mapped_children = false;
        for (Tree child : t1.getChildren()) {
            if (mappings.isSrcMapped(child)) {
                has_mapped_children = true;
                break;
            }
        }
        return has_mapped_children;
    }

    public MappingStore map() {
        for (Tree t1 : src.postOrder()) {
            if (mappings.isSrcMapped(t1)) {
                continue;
            }

            if (!src_has_mapped_children(t1)) {
                continue;
            }

            for (Tree candidate : calculate_candidates(t1)) {
                if (calculate_dice(new Pair<Tree, Tree>(t1, candidate)) > MIN_DICE) {
                    add_mapping_if_allowed(t1, candidate);

                    if (Math.max(t1.getMetrics().size, candidate.getMetrics().size) < MAX_TREE_SIZE) {
                        RtedMatcher rted = new RtedMatcher();
                        MappingStore opt_mappings = rted.match(t1, candidate, new MappingStore(t1, candidate));

                        for (Mapping m : opt_mappings) {
                            if (mappings.has(m.first, m.second)) {
                                continue;
                            }
                            add_mapping_if_allowed(m.first, m.second);
                        }
                    }
                    break;
                }
            }
        }
        return mappings;
    }

}
