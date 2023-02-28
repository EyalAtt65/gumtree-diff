/*
 * This file is part of GumTree.
 *
 * GumTree is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * GumTree is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with GumTree.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Copyright 2011-2015 Jean-Rémy Falleri <jr.falleri@gmail.com>
 * Copyright 2011-2015 Floréal Morandat <florealm@gmail.com>
 */

package com.github.gumtreediff.client;

import com.github.gumtreediff.actions.*;
import com.github.gumtreediff.gen.TreeGenerators;
import com.github.gumtreediff.gen.python.PythonTreeGenerator;
import com.github.gumtreediff.io.ActionsIoUtils;
import com.github.gumtreediff.mappers.BottomUpMapper;
import com.github.gumtreediff.mappers.TopDownMapper;
import com.github.gumtreediff.matchers.*;
import com.github.gumtreediff.matchers.heuristic.gt.GreedyBottomUpMatcher;
import com.github.gumtreediff.matchers.heuristic.gt.GreedySubtreeMatcher;
import com.github.gumtreediff.tree.TreeContext;
import com.github.gumtreediff.gen.TreeGenerator;
import org.atteo.classindex.ClassIndex;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;


public class Run {

//    public static void initGenerators() {
//        ClassIndex.getSubclasses(TreeGenerator.class).forEach(
//                gen -> {
//                    com.github.gumtreediff.gen.Register a =
//                            gen.getAnnotation(com.github.gumtreediff.gen.Register.class);
//                    if (a != null)
//                        TreeGenerators.getInstance().install(gen, a);
//                });
//    }
//
//    public static void initMatchers() {
//        ClassIndex.getSubclasses(Matcher.class).forEach(
//                gen -> {
//                    com.github.gumtreediff.matchers.Register a =
//                            gen.getAnnotation(com.github.gumtreediff.matchers.Register.class);
//                    if (a != null)
//                        Matchers.getInstance().install(gen, a);
//                });
//    }
//
//    static {
//        initGenerators();
//        initMatchers();
//    }

    private static void assert_mappings(MappingStore mappings, MappingStore orig_mappings) {
        int counter0 = 0;
        for (Mapping m : mappings) {
            if (!orig_mappings.has(m.first, m.second)) {
                counter0++;
//                throw new AssertionError("Bad mapping in my algo");
            }
        }
        System.out.printf("%s bad mappings in my algo\n", counter0);


        int counter = 0;
        for (Mapping om : orig_mappings) {
            if (!mappings.has(om.first, om.second)) {
//                mappings.addMapping(om.first, om.second);
                counter++;
            }
        }
        System.out.printf("%s missing original mappings in my algo\n", counter);
//        if (counter > 1) {
//            throw new AssertionError("Missing original mappings in my algo");
//        }
    }


//    public void run_tests() {
//        File tests_dir = new File("tests");
//        Arrays.stream(tests_dir.listFiles()).sorted()
//        for (File f : tests_dir.listFiles()) {
//
//        }
//    }

    public static void main(String[] origArgs) throws IOException, Exception {
//        Run.initGenerators(); // registers the available parsers
        String srcFile = "C:\\project\\gumtree-diff\\gumtree_reduced\\tests\\4a.py";
        String dstFile = "C:\\project\\gumtree-diff\\gumtree_reduced\\tests\\4b.py";
        TreeContext src = new PythonTreeGenerator().generateFrom().file(srcFile);
        TreeContext dst = new PythonTreeGenerator().generateFrom().file(dstFile);

//        Matcher defaultMatcher = Matchers.getInstance().getMatcher(); // retrieves the default matcher
//        MappingStore mappings = defaultMatcher.match(src.getRoot(), dst.getRoot()); // computes the mappings between the trees
        /* original */
        Matcher greedy_subtree = new GreedySubtreeMatcher();
        MappingStore orig_td_mappings = greedy_subtree.match(src.getRoot(), dst.getRoot());
        Matcher greedy_bottomup = new GreedyBottomUpMatcher();
        MappingStore orig_bu_mappings = greedy_bottomup.match(src.getRoot(), dst.getRoot(), orig_td_mappings);

        /* my */
        TopDownMapper td_mapper = new TopDownMapper(src.getRoot(), dst.getRoot());
        MappingStore td_mappings = td_mapper.map();
        assert_mappings(td_mappings, orig_td_mappings);
        BottomUpMapper bu_mapper = new BottomUpMapper(src.getRoot(), dst.getRoot(), td_mappings);
        MappingStore bu_mappings = bu_mapper.map();

        assert_mappings(bu_mappings, orig_bu_mappings);

        EditScriptGenerator editScriptGenerator = new SimplifiedChawatheScriptGenerator(); // instantiates the simplified Chawathe script generator
        EditScript actions = editScriptGenerator.computeActions(bu_mappings); // computes the edit script

        ActionsIoUtils.ActionSerializer serializer = ActionsIoUtils.toJson(src, actions, bu_mappings);
        serializer.writeTo(System.out);
    }
}
