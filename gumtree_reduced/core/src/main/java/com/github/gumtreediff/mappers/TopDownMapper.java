package com.github.gumtreediff.mappers;

import com.github.gumtreediff.matchers.Mapping;
import com.github.gumtreediff.matchers.MappingStore;
import com.github.gumtreediff.tree.Tree;
import com.github.gumtreediff.utils.Pair;

import java.util.*;

public class TopDownMapper extends AbstractMapper {
    /** This is zero-based. Note that in the paper they use height that is one-based. */
    private final int MIN_HEIGHT = 1;
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
     * Structure is the same, same type, same label. */
    public boolean are_isomorphic_nodes(Tree t1, Tree t2) {
        return t1.isIsoStructuralTo(t2) && t1.hasSameTypeAndLabel(t2);
    }

    /**
     * Structure is the same, same type. */
    public boolean are_almost_isomorphic_nodes(Tree t1, Tree t2) {
        return t1.isIsoStructuralTo(t2) && t1.hasSameType(t2);
    }

    /**
     * Returns a list of pairs, of all isomorphic descendants of t1 and t2.
     * almost_isomorphic determines if this function will use are_isomorphic_nodes or are_almost_isomorphic_nodes. */
    public List<Pair<Tree, Tree>> get_isomorphic_descendants(Tree t1, Tree t2, boolean almost_isomorphic) {
        List<Pair<Tree, Tree>> out = new ArrayList<>();
        for (Tree descendant1 : t1.getDescendants()) {
            for (Tree descendant2 : t2.getDescendants()) {
                if (almost_isomorphic) {
                    if (are_almost_isomorphic_nodes(descendant1, descendant2)) {
                        out.add(new Pair<>(descendant1, descendant2));
                    }
                } else {
                    if (are_isomorphic_nodes(descendant1, descendant2)) {
                        out.add(new Pair<>(descendant1, descendant2));
                    }
                }
            }
        }
        return out;
    }

    public boolean exists_other_isomorphic_node(Tree t1, Tree t2, Tree Tree2) {
        for (Tree tx : Tree2.preOrder()) {
            if (tx.getMetrics().hash != t2.getMetrics().hash) {
                if (are_isomorphic_nodes(t1, tx)) {
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

            add_mapping_if_allowed(p.first, p.second);

            List<Pair<Tree, Tree>> iso_pairs = get_isomorphic_descendants(p.first, p.second, false);
            for (Pair<Tree, Tree> iso_pair : iso_pairs) {
                add_mapping_if_allowed(iso_pair.first, iso_pair.second);
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
                Math.min(src_pq.peek_max(), dst_pq.peek_max()) > this.MIN_HEIGHT -2) {
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
                    if (are_isomorphic_nodes(p.first, p.second)) {
                        if (exists_other_isomorphic_node(p.first, p.second, dst) ||
                            exists_other_isomorphic_node(p.second, p.first, src)) {
                            candidates.add(p);
                        } else {
                            add_mapping_if_allowed(p.first, p.second);
                            for (Pair<Tree, Tree> iso_pair : get_isomorphic_descendants(p.first, p.second, false)) {
                                add_mapping_if_allowed(iso_pair.first, iso_pair.second);
                            }
                            /* almost_isomorphic nodes are candidates for "update" actions */
                            for (Pair<Tree, Tree> iso_pair : get_isomorphic_descendants(p.first, p.second, true)) {
                                candidates.add(iso_pair);
                            }
                        }
                    /* almost_isomorphic nodes are candidates for "update" actions */
                    } else if (are_almost_isomorphic_nodes(p.first, p.second)) {
                        candidates.add(p);
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
        @Override
        public int compare(Pair<Tree, Tree> p1, Pair<Tree, Tree> p2) {
            /* Dice needs to be calculated on the _parents_ of the compared nodes */
            return Double.compare(calculate_dice(new Pair<Tree, Tree>(p2.first.getParent(), p2.second.getParent())),
                    calculate_dice(new Pair<Tree, Tree>(p1.first.getParent(), p1.second.getParent())));
        }
    }
}
