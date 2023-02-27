package com.github.gumtreediff.mapper;

import com.github.gumtreediff.tree.Tree;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.PriorityQueue;

public class TreePQ extends PriorityQueue<Tree> {
    /** Compare by height */
    static class TreeComparator implements Comparator<Tree> {
        @Override
        public int compare(Tree t1, Tree t2) {
            return t1.getMetrics().height - t2.getMetrics().height;
        }
    }
    public TreePQ() {
        super(new TreeComparator());
    }

    public int peek_max() {
        assert this.peek() != null;
        return this.peek().getMetrics().height;
    }

    /**
     *  Pop all trees with height equal to the current max height.
     *  They are returned in the output list. */
    public ArrayList<Tree> pop_list() {
        ArrayList<Tree> out = new ArrayList<>();
        int max_height = this.peek_max();
        while (this.size() > 0 && this.peek_max() == max_height) {
            out.add(this.poll());
        }
        return out;
    }

    /**
     * Add all children of the input trees to the PQ */
    public void open_list(ArrayList<Tree> trees) {
        for (Tree parent : trees) {
            this.addAll(parent.getChildren());
        }
    }
}
