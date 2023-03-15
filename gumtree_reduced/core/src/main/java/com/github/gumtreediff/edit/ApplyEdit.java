package com.github.gumtreediff.edit;

import com.github.gumtreediff.tree.Tree;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.google.gson.stream.JsonWriter;
import org.json.JSONArray;
import org.json.JSONObject;


public class ApplyEdit {
    public ApplyEdit() {}

    private int[] get_int_array(JSONObject action) {
        JSONArray json_range = action.getJSONObject("tree").getJSONArray("range");
        return new int[]{json_range.getInt(0), json_range.getInt(1)};
    }

    private boolean exists_range(List<int[]> ranges, int[] target) {
        return get_range_index(ranges, target) != -1;
    }

    private int get_range_index(List<int[]> ranges, int[] target) {
        int index = -1;
        for (int i = 0; i < ranges.size(); i++) {
            if (target[0] == ranges.get(i)[0] && target[1] == ranges.get(i)[1]) {
                index = i;
                break;
            }
        }
        return index;
    }

    private boolean should_ignore_action(String action_str) {
        // TODO: decide about delete-tree
        return (action_str.equals("delete-tree") || // currently not supported
                action_str.equals("insert-node") || // irrelevant
                action_str.equals("insert-tree")); // irrelevant
    }

    private JSONObject handle_move(JSONObject action, Tree node) {
        int target_child_idx = action.getInt("at"); // node will be moved to be this child index in parent
        int target_pos;
        try {
            target_pos = node.getParent().getChild(target_child_idx).getEndPos();
        } catch (IndexOutOfBoundsException e) {
            if (target_child_idx == 0) { // no children
                target_pos = node.getParent().getPos();
            } else { // adding new child
                int last_child_idx = node.getParent().getChildren().size() - 1;
                target_pos = node.getParent().getChild(last_child_idx).getEndPos();
            }
        }

        JSONObject new_action = new JSONObject();
        new_action.put("action", "move-tree");
        JSONArray from_range = new JSONArray();
        JSONArray to_range = new JSONArray();
        from_range.put(node.getPos());
        from_range.put(node.getEndPos());
        to_range.put(target_pos);
        to_range.put(target_pos + node.getLength());
        new_action.put("from", from_range);
        new_action.put("to", to_range);

        return new_action;
    }

    private JSONObject handle_insert(JSONObject action, Tree parent) {
        String label = action.getString("label");
        if (label.isEmpty()) {
            return null;
        }
        JSONObject new_action = new JSONObject();
        new_action.put("action", "insert-node");
        JSONArray to_range = new JSONArray();
        int child_idx = action.getInt("at");
        int start_pos = -1;
        try {
            start_pos = parent.getChild(child_idx).getPos();
        } catch (IndexOutOfBoundsException e) {
            if (child_idx == 0) { // no children
                start_pos = parent.getPos();
            } else { // adding new child
                start_pos = parent.getChild(child_idx - 1).getEndPos();
            }
        }
        new_action.put("label", label);
        to_range.put(start_pos);
        to_range.put(start_pos + label.length());
        new_action.put("to", to_range);
        return new_action;
    }

    private List<int[]> get_action_ranges(JSONArray actions) {
        List<int[]> ranges = new ArrayList<>();
        for (int i = 0; i < actions.length(); i++) {
            JSONObject action = actions.getJSONObject(i);
            String action_str = action.getString("action");
            if (should_ignore_action(action_str)) {
                continue;
            }
            int[] int_range = get_int_array(action);
            if (!exists_range(ranges, int_range)) {
                ranges.add(int_range);
            }
        }
        return ranges;
    }

    private JSONObject generate_new_actions(JSONArray actions, List<int[]> ranges, List<Tree> trees) {
        JSONObject new_actions = new JSONObject();
        JSONArray new_actions_array = new JSONArray();

        for (int i = 0; i < actions.length(); i++) {
            JSONObject action = actions.getJSONObject(i);
            String action_str = action.getString("action");
            if (action_str.equals("delete-tree")) { // TODO
                continue;
            }

            JSONObject new_action;
            if (action_str.equals("move-tree")) {
                int[] int_range = get_int_array(action);
                int relevant_index = get_range_index(ranges, int_range);
                if (relevant_index == -1) {
                    continue;
                }
                Tree relevant_node = trees.get(relevant_index + 1); // TODO: assuming first is parent node

                new_action = handle_move(action, relevant_node);
                if (new_action == null) {
                    continue;
                }
            } else if (action_str.equals("insert-node")) {
                new_action = handle_insert(action, trees.get(0));
                if (new_action == null) {
                    continue;
                }
            } else { // TODO
                continue;
            }
            new_actions_array.put(new_action);
        }

        new_actions.put("action", new_actions_array);
        return new_actions;
    }
    public JSONObject apply_edit_script(String json_path, Tree t) throws IOException {
        var data = new String(Files.readAllBytes(Paths.get(json_path)));
        JSONObject json = new JSONObject(data);

        JSONArray offset_to_apply = json.getJSONArray("apply_offset");
        List<Tree> trees = t.getTreesBetweenPositions(offset_to_apply.getInt(0), offset_to_apply.getInt(1));
        JSONArray actions = json.getJSONArray("actions");

        // assuming first node is the parent of rest of nodes, and they are sorted according to range

        // get ranges of unique _existing_ nodes that have actions applied to them (excluding insert)
        List<int[]> ranges = get_action_ranges(actions);
        ranges.sort(new RangesComparator());

        // create the output json, with the actions applied to the new nodes
        return generate_new_actions(actions, ranges, trees);
    }

    public class RangesComparator implements Comparator<int[]> {
        @Override
        public int compare(int[] r1, int[] r2) {
            // Compare by end offset
            return Integer.compare(r1[1], r2[1]);
        }
    }
}
