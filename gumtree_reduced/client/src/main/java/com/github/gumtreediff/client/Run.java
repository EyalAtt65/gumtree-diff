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
import com.github.gumtreediff.matchers.MappingStore;
import com.github.gumtreediff.tree.Tree;
import com.github.gumtreediff.tree.TreeContext;
import com.github.gumtreediff.utils.Pair;
import com.github.gumtreediff.utils.Registry;
import com.github.gumtreediff.gen.TreeGenerator;
import com.github.gumtreediff.matchers.Matcher;
import com.github.gumtreediff.matchers.Matchers;
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

    public static class Options implements Option.Context {
        @Override
        public Option[] values() {
            return new Option[]{
                    new Option("-C", "Set system property (-c property value). ",
                            2) {

                        @Override
                        protected void process(String name, String[] args) {
                            System.setProperty(args[0], args[1]);
                        }
                    },
                    new Option.Verbose(),
                    new Help(this)
            };
        }
    }

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

    public static void initClients() {
        ClassIndex.getSubclasses(Client.class).forEach(
                cli -> {
                    com.github.gumtreediff.client.Register a =
                            cli.getAnnotation(com.github.gumtreediff.client.Register.class);
                    if (a != null)
                        Clients.getInstance().install(cli, a);
                });
    }

    static {
        initGenerators();
        initMatchers();
    }

    public static void startClient(String name, Registry.Factory<? extends Client> client, String[] args) {
        try {
            Client inst = client.newInstance(new Object[]{ args });
            try {
                inst.run();
            } catch (Exception e) {
                System.err.printf("Error while running client '%s'.\n", name);
                e.printStackTrace();
            }
        } catch (InvocationTargetException e) {
            System.err.printf("Error while parsing arguments of client '%s'.\n", name);
            e.printStackTrace();
        } catch (InstantiationException | IllegalAccessException e) {
            System.err.printf("Can't instantiate client '%s'.", name);
            e.printStackTrace();
        }
    }

    public static void main(String[] origArgs) throws IOException, Exception {
//        Options opts = new Options();
//        String[] args = Option.processCommandLine(origArgs, opts);
//
//        initClients();
//
//        Registry.Factory<? extends Client> client;
//        if (args.length == 0) {
//            System.err.println("No command given.");
//            displayHelp(System.err, opts);
//        } else if ((client = Clients.getInstance().getFactory(args[0])) == null) {
//            System.err.printf("Unknown sub-command '%s'.\n", args[0]);
//            displayHelp(System.err, opts);
//        } else {
//            var clientArgs = new ArrayList<>(Arrays.asList(args));
//            clientArgs.remove(0);
//            if (Arrays.asList(origArgs).contains("--help"))
//                clientArgs.add("--help");
//            String[] finalArgs = new String[clientArgs.size()];
//            clientArgs.toArray(finalArgs);
//            startClient(origArgs[0], client, finalArgs);
//        }
        Run.initGenerators(); // registers the available parsers
        String srcFile = "C:\\project\\a.py";
        String dstFile = "C:\\project\\b.py";
        TreeContext src = new PythonTreeGenerator().generateFrom().file(srcFile);
        TreeContext dst = new PythonTreeGenerator().generateFrom().file(dstFile);

        Matcher defaultMatcher = Matchers.getInstance().getMatcher(); // retrieves the default matcher
        MappingStore mappings = defaultMatcher.match(src.getRoot(), dst.getRoot()); // computes the mappings between the trees

        EditScriptGenerator editScriptGenerator = new SimplifiedChawatheScriptGenerator(); // instantiates the simplified Chawathe script generator
        EditScript actions = editScriptGenerator.computeActions(mappings); // computes the edit script

        ActionsIoUtils.ActionSerializer serializer = ActionsIoUtils.toJson(src, actions, mappings);
        serializer.writeTo(System.out);
    }

    public static void displayHelp(PrintStream out, Option.Context ctx) {
        out.println("Available Options:");
        Option.displayOptions(out, ctx);
        out.println();
        listCommand(out);
    }

    public static void listCommand(PrintStream out) {
        out.println("Available Commands:");
        for (Registry.Entry cmd: Clients.getInstance().getEntries())
            out.println("* " + cmd);
    }

    static class Help extends Option.Help {
        public Help(Context ctx) {
            super(ctx);
        }

        @Override
        public void process(String name, String[] args) {
            displayHelp(System.out, context);
        }
    }
}
