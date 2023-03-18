package com.github.gumtreediff.client;

import com.github.gumtreediff.actions.*;
import com.github.gumtreediff.edit.ApplyEdit;
import com.github.gumtreediff.gen.SyntaxException;
import com.github.gumtreediff.gen.TreeGenerators;
import com.github.gumtreediff.gen.python.PythonTreeGenerator;
import com.github.gumtreediff.io.ActionsIoUtils;
import com.github.gumtreediff.mappers.BottomUpMapper;
import com.github.gumtreediff.mappers.TopDownMapper;
import com.github.gumtreediff.matchers.*;
import com.github.gumtreediff.tree.TreeContext;
import com.github.gumtreediff.gen.TreeGenerator;
import org.atteo.classindex.ClassIndex;

import org.json.JSONObject;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.NoSuchFileException;
import java.util.Arrays;


public class Run {
    public static enum ErrorCodes {
        SUCCESS, // 0
        SYNTAX_ERROR_SRC, // 1
        SYNTAX_ERROR_DST, // 2
        INVALID_PATH_SRC, // 3
        INVALID_PATH_DST, // 4
        PYTHONPARSER_NOT_FOUND // 5
    }
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
//                    new Help(this)
            };
        }
    }

    public static void main(String[] origArgs) throws IOException, Exception, FileNotFoundException {
        Options opts = new Options();
        TreeContext src = null, dst = null;

        String[] args = Option.processCommandLine(origArgs, opts);
        try {
            src = new PythonTreeGenerator(args[2]).generateFrom().file(args[0]);

        } catch (InvalidPathException e) {
            System.exit(ErrorCodes.INVALID_PATH_SRC.ordinal());
        } catch (NoSuchFileException e) {
            System.exit(ErrorCodes.INVALID_PATH_SRC.ordinal());
        } catch (SyntaxException e) {
            System.exit(ErrorCodes.SYNTAX_ERROR_SRC.ordinal());
        } catch (IOException e) {
            System.err.printf(e.getMessage());
            System.exit(ErrorCodes.PYTHONPARSER_NOT_FOUND.ordinal());
        }

        try {
            dst = new PythonTreeGenerator(args[2]).generateFrom().file(args[1]);
        } catch (InvalidPathException e) {
            System.exit(ErrorCodes.INVALID_PATH_DST.ordinal());
        } catch (NoSuchFileException e) {
            System.exit(ErrorCodes.INVALID_PATH_SRC.ordinal());
        } catch (SyntaxException e) {
            System.exit(ErrorCodes.SYNTAX_ERROR_DST.ordinal());
        }

        if (args.length == 4) {
            var applier = new ApplyEdit();
            JSONObject new_actions = applier.apply_edit_script(args[3], dst.getRoot());
            System.out.print(new_actions.toString());
            return;
        }

        TopDownMapper td_mapper = new TopDownMapper(src.getRoot(), dst.getRoot());
        MappingStore td_mappings = td_mapper.map();
        BottomUpMapper bu_mapper = new BottomUpMapper(src.getRoot(), dst.getRoot(), td_mappings);
        MappingStore bu_mappings = bu_mapper.map();

        EditScriptGenerator editScriptGenerator = new SimplifiedChawatheScriptGenerator();
        EditScript actions = editScriptGenerator.computeActions(bu_mappings);

        ActionsIoUtils.ActionSerializer serializer = ActionsIoUtils.toJson(src, actions, bu_mappings);
        serializer.writeTo(System.out);
    }
}
