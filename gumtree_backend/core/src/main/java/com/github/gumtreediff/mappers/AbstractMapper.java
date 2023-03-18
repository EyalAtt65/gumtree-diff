package com.github.gumtreediff.mappers;

import com.github.gumtreediff.matchers.MappingStore;
import com.github.gumtreediff.tree.Tree;
import com.github.gumtreediff.utils.Pair;

public abstract class AbstractMapper {
    protected Tree src;
    protected Tree dst;
    protected MappingStore mappings;
    public abstract MappingStore map();

    protected void add_mapping_if_allowed(Tree t1, Tree t2) {
        if (mappings.isMappingAllowed(t1, t2)) {
            mappings.addMapping(t1, t2);
        }
    }

    protected double calculate_dice(Pair<Tree, Tree> p) {
        int num_descendants1 = p.first.getDescendants().size();
        int num_descendants2 = p.second.getDescendants().size();
        int num_mapped_descendants = 0;
        for (Tree d : p.first.getDescendants()) {
            if (mappings.isSrcMapped(d)) {
                Tree mapped_dst = mappings.getDstForSrc(d);
                if (p.second.getDescendants().contains(mapped_dst)) {
                    num_mapped_descendants++;
                }
            }
        }
        return 2d * num_mapped_descendants / (num_descendants1 + num_descendants2);
    }
}
