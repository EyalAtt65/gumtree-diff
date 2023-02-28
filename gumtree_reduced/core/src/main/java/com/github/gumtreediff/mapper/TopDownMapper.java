package com.github.gumtreediff.mapper;

import com.github.gumtreediff.matchers.Mapping;
import com.github.gumtreediff.matchers.MappingStore;
import com.github.gumtreediff.tree.Tree;
import com.github.gumtreediff.utils.Pair;
import com.sun.source.tree.TreeVisitor;

import java.util.*;

public class TopDownMapper {
    private Tree src;
    private Tree dst;
    private MappingStore mappings;
    /** This is zero-based. Note that in the paper they use height that is one-based. */
    private final int min_height = 1;
    public TopDownMapper(Tree src, Tree dst) {
        this.src = src;
        this.dst = dst;
        mappings = new MappingStore(src, dst);
    }

    public static List<Pair<Tree, Tree>> tree_cartesian_product(ArrayList<Tree> l1, ArrayList<Tree> l2) {
        List<Pair<Tree, Tree>> out = new ArrayList<>();
        for (Tree t1: l1) {
            for (Tree t2: l2) {
                out.add(new Pair<>(t1, t2));
            }
        }
        return out;
    }

    /**
     * Returns a list of pairs, of all isomorphic descendants of t1 and t2. */
    public List<Pair<Tree, Tree>> get_isomorphic_descendants(Tree t1, Tree t2) {
        List<Pair<Tree, Tree>> out = new ArrayList<>();
        for (Tree descendant1 : t1.getDescendants()) {
            for (Tree descendant2 : t2.getDescendants()) {
                if (descendant1.isIsomorphicTo(descendant2)) {
                    out.add(new Pair<>(descendant1, descendant2));
                }
            }
        }
        return out;
    }

    public boolean exists_other_isomorphic_node(Tree t1, Tree t2, Tree Tree2) {
        for (Tree tx : Tree2.preOrder()) { // TODO: maybe not optimal?
            // TODO: is the hash how we check that it's the same node?
            if (tx.getMetrics().hash != t2.getMetrics().hash) {
                if (t1.isIsomorphicTo(tx)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Look for t in the mapping.
     * If as_first is true then t must be the first item in the mapping (otherwise - second). */
    private boolean tree_exists_in_mapping(Tree t, MappingStore mappings, boolean as_first) {
        for (Mapping m : mappings) {
            Tree mapped_tree = as_first ? m.first : m.second;
            if (mapped_tree.getMetrics().hash == t.getMetrics().hash) {
                return true;
            }
        }
        return false;
    }

    /**
     * See tree_exists_in_mapping. */
    private boolean tree_exists_in_candidates(Tree t, List<Pair<Tree, Tree>> candidates, boolean as_first) {
        for (Pair<Tree,Tree> p : candidates) {
            Tree candidate_tree = as_first ? p.first : p.second;
            if (candidate_tree.getMetrics().hash == t.getMetrics().hash) {
                return true;
            }
        }
        return false;
    }

    /**
     * Sort candidates according to dice and then map isomorphic descendants.
     * This method will empty candidates. */
    public void map_candidates(List<Pair<Tree, Tree>> candidates) {
        candidates.sort(new CandidatesComparator());
        while (candidates.size() > 0) {
            Pair<Tree, Tree> p = candidates.get(0);
            candidates.remove(0);

            List<Pair<Tree, Tree>> iso_pairs = get_isomorphic_descendants(p.first, p.second);
            for (Pair<Tree, Tree> iso_pair : iso_pairs) {
                if (mappings.isMappingAllowed(iso_pair.first, iso_pair.second)) {
                    mappings.addMapping(iso_pair.first, iso_pair.second);
                }
            }

            candidates.removeIf(candidate -> candidate.first == p.first || candidate.second == p.second);
        }
    }

    public MappingStore map() {
        /* T1 = this.src; T2 = this.dst; M = this.mappings; L1 = src_pq; L2 = dst_pq */
        TreePQ src_pq = new TreePQ();
        TreePQ dst_pq = new TreePQ();

        /* A = candidates */
        List<Pair<Tree, Tree>> candidates = new ArrayList<>();
        src_pq.add(src);
        dst_pq.add(dst);

        while (src_pq.size() > 0 && dst_pq.size() > 0 &&
                Math.min(src_pq.peek_max(), dst_pq.peek_max()) > this.min_height - 1) { // TODO: why -1?
            if (src_pq.peek_max() != dst_pq.peek_max()) {
                if (src_pq.peek_max() > dst_pq.peek_max()) {
                    ArrayList<Tree> popped = src_pq.pop_list();
                    src_pq.open_list(popped);
                } else {
                    ArrayList<Tree> popped = dst_pq.pop_list();
                    dst_pq.open_list(popped);
                }

            } else {
                ArrayList<Tree> H1 = src_pq.pop_list();
                ArrayList<Tree> H2 = dst_pq.pop_list();
                for (Pair<Tree, Tree> p : tree_cartesian_product(H1, H2)) {
                    /* t1 = p.first ; t2 = p.second */
                    if (p.first.isIsomorphicTo(p.second)) {
                        if (exists_other_isomorphic_node(p.first, p.second, dst) ||
                            exists_other_isomorphic_node(p.second, p.first, src)) {
                            candidates.add(p);
                        } else {
                            if (mappings.isMappingAllowed(p.first, p.second)) {
                                mappings.addMapping(p.first, p.second);
                            }
                            for (Pair<Tree, Tree> iso_pair : get_isomorphic_descendants(p.first, p.second)) {
                                if (mappings.isMappingAllowed(iso_pair.first, iso_pair.second)) {
                                    mappings.addMapping(iso_pair.first, iso_pair.second);
                                }
                            }
                        }
                    }
                }

                for (Tree t1 : H1) {
                    if (!tree_exists_in_candidates(t1, candidates, true) &&
                            !tree_exists_in_mapping(t1, mappings, true)) {
                        src_pq.addAll(t1.getChildren());
                    }
                }
                for (Tree t2 : H2) {
                    if (!tree_exists_in_candidates(t2, candidates, false) &&
                            !tree_exists_in_mapping(t2, mappings, false)) {
                        dst_pq.addAll(t2.getChildren());
                    }
                }
            }
        }

        map_candidates(candidates);
        return mappings;
    }

    public class CandidatesComparator implements Comparator<Pair<Tree, Tree>> {
        private double calculate_dice(Pair<Tree, Tree> p) {
            int num_descendants1 = p.first.getDescendants().size();
            int num_descendants2 = p.second.getDescendants().size();
            int counter = 0;
            for (Tree d : p.first.getDescendants()) {
                if (mappings.has(d, p.second)) {
                    counter++;
                }
            }
            return 2d * counter / (num_descendants1 + num_descendants2);
        }
        @Override
        public int compare(Pair<Tree, Tree> p1, Pair<Tree, Tree> p2) {
            return Double.compare(calculate_dice(new Pair<Tree, Tree>(p2.first.getParent(), p2.second.getParent())),
                    calculate_dice(new Pair<Tree, Tree>(p1.first.getParent(), p1.second.getParent())));
        }
    }
}
