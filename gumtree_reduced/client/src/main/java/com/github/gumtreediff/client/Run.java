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
import com.github.gumtreediff.actions.model.Action;
import com.github.gumtreediff.gen.TreeGenerators;
import com.github.gumtreediff.gen.python.PythonTreeGenerator;
import com.github.gumtreediff.io.ActionsIoUtils;
import com.github.gumtreediff.io.DirectoryComparator;
import com.github.gumtreediff.mapper.TopDownMapper;
import com.github.gumtreediff.matchers.*;
import com.github.gumtreediff.matchers.heuristic.gt.GreedySubtreeMatcher;
import com.github.gumtreediff.tree.Tree;
import com.github.gumtreediff.tree.TreeContext;
import com.github.gumtreediff.utils.Pair;
import com.github.gumtreediff.utils.Registry;
import com.github.gumtreediff.gen.TreeGenerator;
import org.atteo.classindex.ClassIndex;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintStream;
import java.lang.reflect.InvocationTargetException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Set;


public class Run {

    public static void initGenerators() {
        ClassIndex.getSubclasses(TreeGenerator.class).forEach(
                gen -> {
                    com.github.gumtreediff.gen.Register a =
                            gen.getAnnotation(com.github.gumtreediff.gen.Register.class);
                    if (a != null)
                        TreeGenerators.getInstance().install(gen, a);
                });
    }

    public static void initMatchers() {
        ClassIndex.getSubclasses(Matcher.class).forEach(
                gen -> {
                    com.github.gumtreediff.matchers.Register a =
                            gen.getAnnotation(com.github.gumtreediff.matchers.Register.class);
                    if (a != null)
                        Matchers.getInstance().install(gen, a);
                });
    }

    static {
        initGenerators();
        initMatchers();
    }

    private static void assert_mappings(MappingStore mappings, MappingStore orig_mappings) {
        for (Mapping m : mappings) {
            if (!orig_mappings.has(m.first, m.second)) {
                throw new AssertionError("Bad mapping in my algo");
            }
        }
        for (Mapping om : orig_mappings) {
            if (!mappings.has(om.first, om.second)) {
                throw new AssertionError("Missing original mapping in my algo");
            }
        }
    }

    public static void main(String[] origArgs) throws IOException, Exception {
        Run.initGenerators(); // registers the available parsers
        String srcFile = "C:\\project\\c.py";
        String dstFile = "C:\\project\\e.py";
        TreeContext src = new PythonTreeGenerator().generateFrom().file(srcFile);
        TreeContext dst = new PythonTreeGenerator().generateFrom().file(dstFile);

//        Matcher defaultMatcher = Matchers.getInstance().getMatcher(); // retrieves the default matcher
//        MappingStore mappings = defaultMatcher.match(src.getRoot(), dst.getRoot()); // computes the mappings between the trees
        /* original */
        Matcher greedy_subtree = new GreedySubtreeMatcher();
        MappingStore orig_mappings = greedy_subtree.match(src.getRoot(), dst.getRoot());

        /* my */
        TopDownMapper mapper = new TopDownMapper(src.getRoot(), dst.getRoot());
        MappingStore mappings = mapper.map();

        assert_mappings(mappings, orig_mappings);

        EditScriptGenerator editScriptGenerator = new SimplifiedChawatheScriptGenerator(); // instantiates the simplified Chawathe script generator
        EditScript actions = editScriptGenerator.computeActions(mappings); // computes the edit script

        ActionsIoUtils.ActionSerializer serializer = ActionsIoUtils.toJson(src, actions, mappings);
        serializer.writeTo(System.out);
    }
}
