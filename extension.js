const vscode = require('vscode');
const process = require("process");
const { execSync } = require("child_process");
const path = require('node:path');
const fs = require('fs');

const CONFIG_FILE = "config.json"
const TEMP_JSON_FILE = "input.json"

const BACKEND_ERRORCODES = {
	SUCCESS: 0,
	SYNTAX_ERROR_SRC: 1,
	SYNTAX_ERROR_DST: 2,
	INVALID_PATH_SRC: 3,
	INVALID_PATH_DST: 4,
	PYTHONPARSER_NOT_FOUND: 5
}

let source_editor_g = null
let dest_editor_g = null
let actions_json_g = null
let extracted_offset_g = null
let extracted_actions_g = null
let did_prepare_actions_g = false

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "gumtree-diff" is now active!')

	let source_uri = null
	let dest_uri = null
	
	vscode.commands.executeCommand('setContext', 'gumtree-diff.diff_displayed', false);

	vscode.commands.registerCommand('gumtree-diff.source_select', function (uri) {
		source_editor_g = null
		dest_editor_g = null
		actions_json_g = null
		source_uri = uri
		vscode.commands.executeCommand('setContext', 'gumtree-diff.source_selected', true);
	});

	vscode.commands.registerCommand('gumtree-diff.dest_select', function (uri) {
		if (source_uri == null) {
			vscode.window.showErrorMessage("no source file selected")
			return
		}
		dest_uri = uri
		handle_diff(source_uri, dest_uri)
	});

	vscode.commands.registerCommand('gumtree-diff.double_select', async (contextSelection, allSelections) => {
		source_uri = allSelections[0]
		dest_uri = allSelections[1]
		handle_diff(source_uri, dest_uri)
	});

	vscode.commands.registerCommand('gumtree-diff.extract_edit_script', function() {
		extracted_actions_g = null
		did_prepare_actions_g = false
		extracted_offset_g = null
		
		const editor = vscode.window.activeTextEditor
		let is_src = is_src_editor(editor)
		if (is_src === null) {
			return
		}

		let selection_range = get_selection_range(editor)
		if (selection_range === null) {
			return
		}

		extracted_offset_g = range_to_offset(selection_range, editor)
		extracted_actions_g = get_actions_in_selection(extracted_offset_g, is_src)
		vscode.commands.executeCommand('setContext', 'gumtree-diff.edit_script_extracted', true);
	})

	vscode.commands.registerCommand('gumtree-diff.apply_edit_script', function() {
		const editor = vscode.window.activeTextEditor
		let is_src = is_src_editor(editor)
		if (is_src === null) {
			return
		}

		let selection_range = get_selection_range(editor)
		if (selection_range === null) {
			return
		}

		let offset_to_apply = range_to_offset(selection_range, editor)
		if (!did_prepare_actions_g) {
			prepare_actions_json(extracted_actions_g)
			did_prepare_actions_g = true
		}
		
		let updated_actions_json = {"apply_offset": offset_to_apply, "actions": extracted_actions_g}
		var jsonContent = JSON.stringify(updated_actions_json);
		let json_path = path.join(__dirname, TEMP_JSON_FILE)
		fs.writeFileSync(json_path, jsonContent, "utf-8")

		let json_str = execute_backend(source_uri, dest_uri, json_path)
		if (!json_str) {
			vscode.window.showErrorMessage("Backend error in apply edit script")
			return
		}
		let out_json = JSON.parse(json_str)

		editor.edit(editBuilder => {
			perform_edit_actions(out_json, editBuilder, editor)
		})
	})
}

/**
 * @param {vscode.TextEditor} editor 
 * @returns 
 */
function is_src_editor(editor) {
	if (editor == source_editor_g) {
		return true
	} else if (editor == dest_editor_g) {
		return false
	} else {
		vscode.window.showErrorMessage("Unrecognized editor")
		return null
	}
}

/**
 * @param {vscode.TextEditor} editor 
 * @returns 
 */
function get_selection_range(editor) {
	const selection = editor.selection
	if (selection && !selection.isEmpty) {
		return new vscode.Range(selection.start.line, selection.start.character, selection.end.line, selection.end.character)
	} else {
		vscode.window.showErrorMessage("Invalid selection for edit script")
		return null
	}
}

/**
 * @param {*} actions_json 
 * @param {vscode.TextEditorEdit} builder 
 * @param {vscode.TextEditor} editor
 */
function perform_edit_actions(actions_json, builder, editor) {
	for (let i = 0 ; i < actions_json["action"].length; i++) {
		let action = actions_json["action"][i]
		if (action["action"] === "move-tree") {
			perform_move(action, builder, editor)
		}
	}
}

/**
 * 
 * @param {*} action 
 * @param {vscode.TextEditorEdit} builder 
 * @param {vscode.TextEditor} editor
 */
function perform_move(action, builder, editor) {
	let from_range = offset_to_range(action["from"][0], action["from"][1], editor)
	let to_range = offset_to_range(action["to"][0], action["to"][1], editor)
	const text = editor.document.getText(from_range)

	// If inserting to start of line we may need to handle indentation because python
	if (to_range.start.character == 0) {
		let start_of_prev_line = new vscode.Position(to_range.start.line - 1, 0)
		let end_of_prev_line = new vscode.Position(to_range.start.line - 1, 1000) // there's no easy way to get the whole line, so 1000
		const previous_line = editor.document.getText(new vscode.Range(start_of_prev_line, end_of_prev_line))

		let indentation = 0
		for (let i = 0; i < previous_line.length; i++) {
			if (previous_line[i] !== ' ') { // tabs not supported
				break
			}
			indentation++
		}

		builder.insert(to_range.start, " ".repeat(indentation) + text)
	} else {
		builder.insert(to_range.start, text)
	}
	
	// If the part that was moved is a whole indented line, delete the indentation as well
	if (from_range.start.character != 0) {
		let from_line = new vscode.Position(from_range.start.line, 0)
		const start_of_modified_line = editor.document.getText(new vscode.Range(from_line, from_range.start))

		let should_delete_indentation = true
		for (let i = 0; i < start_of_modified_line.length; i++) {
			if (start_of_modified_line[i] !== ' ') {
				should_delete_indentation = false
				break
			}
		}
		if (should_delete_indentation) {
			builder.delete(new vscode.Range(from_line, from_range.end))
		} else {
			builder.delete(from_range)
		}
	} else {
		builder.delete(from_range)
	}
}

function prepare_actions_json(input_json) {
	let output = input_json
	for (var i = 0; i < input_json.length; i++) {
		var action = input_json[i]
		if (action["action"] === "insert-node" || action["action"] === "delete-node") {
			let parent_offsets = match_range_from_json_action(action, "parent")
			let tree_offsets = match_range_from_json_action(action, "tree")				
			output[i]["parent"] = {string: action["parent"], range: parent_offsets}
			output[i]["tree"] = {string: action["tree"], range: tree_offsets}

		} else if (action["action"] === "move-tree") {
			let parent_offsets = match_range_from_json_action(action, "parent")
			let tree_offsets = match_range_from_json_action(action, "tree")				
			output[i]["parent"] = {string: action["parent"], range: parent_offsets}
			output[i]["tree"] = {string: action["tree"], range: tree_offsets}
			let to_offsets = match_range_from_json_action(action, "to")
			output[i]["to"] = {string: action["to"], range: to_offsets}

		} else if (action["action"] === "update-node") {
			let tree_offsets = match_range_from_json_action(action, "tree")
			output[i]["tree"] = {string: action["tree"], range: tree_offsets}
			let to_offsets = match_range_from_json_action(action, "to")
			output[i]["to"] = {string: action["to"], range: to_offsets}
		}
	}
	return output
}

/**
 * 
 * @param {[number, number]} extracted_offset 
 * @param {boolean} is_src
 * @returns
 */
function get_actions_in_selection(extracted_offset, is_src) {
	let actions_in_selection = []
	for (var i = 0; i < actions_json_g.actions.length; i++) {
		var action = actions_json_g.actions[i]
		let action_str = action["action"]
		let action_range
		if (is_src) {
			if (action_str === "insert-tree" || action_str === "insert-node") {
				continue
			}
			action_range = match_range_from_json_action(action, "tree")
		} else {
			if (action_str === "delete-tree") { // TODO: implement?
				continue
			} else if (action_str === "delete-node") {
				action_range = match_range_from_json_action(action, "parent")
			} else if (action_str === "insert-tree" || action_str === "insert-node") {
				action_range = match_range_from_json_action(action, "tree")
			} else if (action_str === "move-tree" || action_str === "update-node") {
				action_range = match_range_from_json_action(action, "to")
			} else {
				continue
			}
		}
		
		if (extracted_offset[0] <= action_range[0] && action_range[1] <= extracted_offset[1]) { // action is in range
			actions_in_selection.push(action)
		}
	}

	return actions_in_selection
}

/**
 * @param {vscode.Uri} source_uri 
 * @param {vscode.Uri} dest_uri 
 */
function handle_diff(source_uri, dest_uri) {
	let json_str = execute_backend(source_uri, dest_uri, null)
	if (!json_str) {
		source_uri = null
		vscode.commands.executeCommand('setContext', 'gumtree-diff.source_selected', false);
		return
	}
	let out_json = JSON.parse(json_str)
	actions_json_g = out_json

	vscode.workspace.openTextDocument(source_uri).then(src_doc => {
		vscode.window.showTextDocument(src_doc).then(src_editor => {
			vscode.workspace.openTextDocument(dest_uri).then(dest_doc => {
				vscode.window.showTextDocument(dest_doc, {viewColumn: vscode.ViewColumn.Beside}).then(dest_editor => {
					source_editor_g = src_editor
					dest_editor_g = dest_editor
					let actions_and_ranges = get_actions_and_ranges(out_json, src_editor, dest_editor)
					decorate_actions(actions_and_ranges, src_editor, dest_editor)
				})
			})
		})
	})

	source_uri = null
	vscode.commands.executeCommand('setContext', 'gumtree-diff.source_selected', false);
	vscode.commands.executeCommand('setContext', 'gumtree-diff.diff_displayed', true);
}

/**
 * @returns {string}
 */
function get_pythonparser() {
	let rawdata = fs.readFileSync(path.join(__dirname, CONFIG_FILE));
	let config = JSON.parse(rawdata.toString());
	return config["pythonparser"]
}

/**
 * @param {vscode.Uri} source_uri 
 * @param {vscode.Uri} dest_uri 
 * @param {string} input_file
 * @returns
 */
function execute_backend(source_uri, dest_uri, input_file) {
	let is_windows = process.platform === "win32";

	let path_delimiter = is_windows ? ";" : ":"
	let classpath = "\"".concat(path.join(__dirname, "gumtree_reduced", "client", "build", "classes", "java", "main"), path_delimiter)
	classpath = classpath.concat(path.join(__dirname, "gumtree_reduced", "core", "build", "classes", "java", "main"), path_delimiter)
	classpath = classpath.concat(path.join(__dirname, "gumtree_reduced", "gen.python", "build", "classes", "java", "main"), path_delimiter)
	classpath = classpath.concat(path.join(__dirname, "gumtree_reduced", "external_jars", "*"), "\"")

	let java_exec = is_windows ? "java.exe" : "java"
	let pythonparser = get_pythonparser()
	let command
	if (input_file !== null) {
		command = `${java_exec} -cp ${classpath} com.github.gumtreediff.client.Run "${source_uri.fsPath}" "${dest_uri.fsPath}" "${pythonparser}" "${input_file}"`
	} else {
		command = `${java_exec} -cp ${classpath} com.github.gumtreediff.client.Run "${source_uri.fsPath}" "${dest_uri.fsPath}" "${pythonparser}"`
	}
	
	let json_str = ""
	try {
		json_str = execSync(command).toString()
	} catch (error) {
		handle_backend_error(error, source_uri, dest_uri)
	}
	
	return json_str

}

/**
 * @param {*} error 
 * @param {vscode.Uri} source_uri 
 * @param {vscode.Uri} dest_uri 
 */
function handle_backend_error(error, source_uri, dest_uri) {
	if (error.status == BACKEND_ERRORCODES.INVALID_PATH_SRC) {
		vscode.window.showErrorMessage(`Source file ${source_uri.fsPath} does not exist`)
	} else if (error.status == BACKEND_ERRORCODES.INVALID_PATH_DST) {
		vscode.window.showErrorMessage(`Destination file ${dest_uri.fsPath} does not exist`)
	} else if (error.status == BACKEND_ERRORCODES.SYNTAX_ERROR_SRC) {
		vscode.window.showErrorMessage(`Source file ${source_uri.fsPath} is not a valid python file`)
	} else if (error.status == BACKEND_ERRORCODES.SYNTAX_ERROR_DST) {
		vscode.window.showErrorMessage(`Destination file ${dest_uri.fsPath} is not a valid python file`)
	} else if (error.status == BACKEND_ERRORCODES.PYTHONPARSER_NOT_FOUND) {
		vscode.window.showErrorMessage(`Cannot find pythonparser. ${error.stderr.toString()}`)
	}
}

/**
 * 
 * @param {{action: String, tree: String, parent: String, at: Number}|
 * {action: String, tree: String, label: String}|
* {action: String, tree: String}} action 
 * @param {string} field_name
 * @returns {[number, number]}
 */
function match_range_from_json_action(action, field_name) {
	const range_re = /.*\[(\d+),(\d+)\]/
	let matches = action[field_name].match(range_re)
	let range_base = matches[1]
	let range_end = matches[2]

	return [Number(range_base), Number(range_end)]
}

/**
 * @param {{matches:{src: String, dest: String}[],
 *  actions:Array.<{action: String, tree: String, parent: String, at: Number}|
 * {action: String, tree: String, label: String}|
 * {action: String, tree: String}>}} json
 * @param {vscode.TextEditor} src_editor 
 * @param {vscode.TextEditor} dst_editor 
 * @returns {Array.<{action: string, range: vscode.Range}|{action: string, ranges:vscode.Range[]}|{action: string, ranges:vscode.Range[], labels:[string, string]}>}
 */
function get_actions_and_ranges(json, src_editor, dst_editor) {
	let actions = []
	for (var i = 0; i < json.actions.length; i++) {
		var action = json.actions[i]
		let src_json_offsets, dst_json_offsets, range1, range2

		if (["delete-tree", "delete-node"].includes(action["action"])) {
			src_json_offsets = match_range_from_json_action(action, "tree")
			range1 = offset_to_range(src_json_offsets[0], src_json_offsets[1], src_editor)
			actions.push({action: action["action"], range: range1})

		} else if (["insert-tree", "insert-node"].includes(action["action"])) {
			dst_json_offsets = match_range_from_json_action(action, "tree")
			range1 = offset_to_range(dst_json_offsets[0], dst_json_offsets[1], dst_editor)
			actions.push({action: action["action"], range: range1})

		} else if (["move-tree", "update-node"].includes(action["action"])) {
			src_json_offsets = match_range_from_json_action(action, "tree")
			dst_json_offsets = match_range_from_json_action(action, "to")
			range1 = offset_to_range(src_json_offsets[0], src_json_offsets[1], src_editor)
			range2 = offset_to_range(dst_json_offsets[0], dst_json_offsets[1], dst_editor)
			
			if (action["action"] === "move-tree") {
				actions.push({action: action["action"], ranges: [range1, range2]})
			} else { // update
				actions.push({action: action["action"], ranges: [range1, range2], labels: [action["old_label"], action["new_label"]]})
			}

		} else {
			console.log("UNKNOWN ACTION")
			console.log(action)
			continue
		}
		
	}

	return actions
}

/**
 * @param {Number} range_base 
 * @param {Number} range_end 
 * @param {vscode.TextEditor} editor 
 * @returns 
 */
function offset_to_range(range_base, range_end, editor) {
	const data = editor.document.getText()
	let is_crlf = editor.document.eol === vscode.EndOfLine.CRLF

	let source_line, source_offset_in_line, dest_line, dest_offset_in_line
	let current_line = 0
	let current_line_offset_in_file = 0
	for (let i = 0; i < data.length; i++) {
		if (i == range_base) {
			source_line = current_line
			source_offset_in_line = i - current_line_offset_in_file
		} else if (i == range_end || i + 1 == data.length) {
			dest_line = current_line
			dest_offset_in_line = i - current_line_offset_in_file
			break
		}
		if (data[i] === '\n') {
			current_line++
			if (is_crlf) {
				/* Gumtree doesn't handle \r in the ranges we get, so each new line we find means there's another \r it ignored, which
				 * pushes the offsets by 1 */
				range_base++
				range_end++
			}
			current_line_offset_in_file = i + 1 // if current char is newline, then the next line starts on next char
		}
	}

	return new vscode.Range(new vscode.Position(source_line, source_offset_in_line), 
							new vscode.Position(dest_line, dest_offset_in_line))
}

/**
 * 
 * @param {vscode.Range} range
 * @param {vscode.TextEditor} editor
 * @returns {[number, number]}
 */
function range_to_offset(range, editor) {
	let is_crlf = editor.document.eol === vscode.EndOfLine.CRLF

	const till_start_position = editor.document.getText(new vscode.Range(0, 0, range.start.line, range.start.character))
	const till_end_position = editor.document.getText(new vscode.Range(0, 0, range.end.line, range.end.character))
	let start_offset = till_start_position.length
	let end_offset = till_end_position.length

	if (is_crlf) {
		// removing 1 per line, for each \r
		start_offset -= range.start.line
		end_offset -= range.end.line
	}

	return [start_offset, end_offset]
}

/**
 * 
 * @param {{range: vscode.Range, hoverMessage: string}[]} arr1 
 * @param {{range: vscode.Range, hoverMessage: string}[]} arr2 
 * @returns {{range: vscode.Range, hoverMessage: string}[]}
 */
function handle_overlapping_ranges(arr1, arr2) {
	let arr_out = []
	while (arr1.length > 0) {
		let curr_decoration = arr1.pop()
		curr_decoration
		let range1 = curr_decoration["range"]
		let should_copy_element = true
		for (let j = 0; j < arr2.length; j++) {
			let range2 = arr2[j]["range"]
			if (range1.start.isAfterOrEqual(range2.end) || range1.end.isBeforeOrEqual(range2.start)) {
				continue
			} else if (range1.start.isAfterOrEqual(range2.start) && range1.end.isBeforeOrEqual(range2.end)) {
				should_copy_element = false
				break
			} else if (range1.start.isAfterOrEqual(range2.start) && range1.end.isAfter(range2.end)) {
				should_copy_element = false
				arr1.push({range: new vscode.Range(range2.end.line, range2.end.character, range1.end.line, range1.end.character),
							hoverMessage: curr_decoration["hoverMessage"]})
				break
			} else if (range1.start.isBefore(range2.start) && range1.end.isBeforeOrEqual(range2.end)) {
				should_copy_element = false
				arr1.push({range: new vscode.Range(range1.start.line, range1.start.character, range2.start.line, range2.start.character),
							hoverMessage: curr_decoration["hoverMessage"]})
				break
			} else if (range1.start.isBefore(range2.start) && range1.end.isAfter(range2.end)) {
				should_copy_element = false
				arr1.push({range: new vscode.Range(range1.start.line, range1.start.character, range2.start.line, range2.start.character),
							hoverMessage: curr_decoration["hoverMessage"]})
				arr1.push({range: new vscode.Range(range2.end.line, range2.end.character, range1.end.line, range1.end.character),
							hoverMessage: curr_decoration["hoverMessage"]})
				break
			}
		}

		if (should_copy_element) {
			arr_out.push(curr_decoration)
		}
	}
	return arr_out
}

/**
 * 
 * @param {vscode.Range[]} arr 
 * @returns
 */
function remove_redundant_ranges(arr) {
	let arr_out = []
	while (arr.length > 0) {
		let curr_range = arr.pop()
		let should_copy = true
		for (let i = 0; i < arr.length; i++) {
			if (curr_range.start.isAfterOrEqual(arr[i].start) && curr_range.end.isBeforeOrEqual(arr[i].end)) {
				should_copy = false
				break
			}
		}
		if (!should_copy) {
			continue
		}
		for (let j = 0; j < arr_out.length; j++) {
			if (curr_range.start.isAfterOrEqual(arr_out[j].start) && curr_range.end.isBeforeOrEqual(arr_out[j].end)) {
				should_copy = false
				break
			}
		}
		if (should_copy) {
			arr_out.push(curr_range)
		}
	}
	return arr_out
}

/**
 * 
 * @param {Array.<{action: String, range: vscode.Range}|
 * {action: string, ranges: vscode.Range[]}|
 * {action: string, ranges:vscode.Range[], labels:[string, string]}>} actions 
 * @param {vscode.TextEditor} src_editor 
 * @param {vscode.TextEditor} dst_editor 
 */
function decorate_actions(actions, src_editor, dst_editor) {
	let redArray = []
	let greenArray = []
	let srcYellowArray = []
	let srcBlueArray = []
	let dstYellowArray = []
	let dstBlueArray = []
	for (let i = 0; i < actions.length; i++) {
		let action = actions[i]
		let src_range, dst_range
		switch (action["action"]) {
			case "delete-tree":
			case "delete-node":
				redArray.push({range: action["range"], hoverMessage: null})
				break
			case "insert-tree":
			case "insert-node":
				greenArray.push({range: action["range"], hoverMessage: null})
				break
			case "move-tree":
				src_range = action["ranges"][0]
				dst_range = action["ranges"][1]
				srcBlueArray.push({range: src_range,
					hoverMessage: `Tree was moved to line: ${dst_range.start.line + 1}, col: ${dst_range.start.character + 1} in destination file`})
				dstBlueArray.push({range: dst_range,
					hoverMessage: `Tree was moved from line: ${src_range.start.line + 1}, col: ${src_range.start.character + 1} in source file`})
				break
			case "update-node":
				src_range = action["ranges"][0]
				dst_range = action["ranges"][1]
				srcYellowArray.push({range: src_range,
					hoverMessage: `Label was updated to *${action["labels"][1]}* in the destination file`})
				dstYellowArray.push({range: dst_range,
					hoverMessage: `Label was updated from *${action["labels"][0]}* in the source file`})
				break
		}
	}

	// srcBlueArray = remove_redundant_ranges(srcBlueArray)
	// srcYellowArray = remove_redundant_ranges(srcYellowArray)
	// redArray = remove_redundant_ranges(redArray)

	// dstBlueArray = remove_redundant_ranges(dstBlueArray)
	// dstYellowArray = remove_redundant_ranges(dstYellowArray)
	// greenArray = remove_redundant_ranges(greenArray)
	
	srcBlueArray = handle_overlapping_ranges(srcBlueArray, srcYellowArray)
	redArray = handle_overlapping_ranges(redArray, srcYellowArray)
	redArray = handle_overlapping_ranges(redArray, srcBlueArray)

		
	dstBlueArray = handle_overlapping_ranges(dstBlueArray, dstYellowArray)
	greenArray = handle_overlapping_ranges(greenArray, dstYellowArray)
	greenArray = handle_overlapping_ranges(greenArray, dstBlueArray)

	src_editor.setDecorations(redType, redArray)
	src_editor.setDecorations(blueType, srcBlueArray)
	src_editor.setDecorations(yellowType, srcYellowArray)

	dst_editor.setDecorations(greenType, greenArray)
	dst_editor.setDecorations(blueType, dstBlueArray)
	dst_editor.setDecorations(yellowType, dstYellowArray)
}

const greenType = vscode.window.createTextEditorDecorationType({
	backgroundColor: '#196719',
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	overviewRulerColor: '#196719',
	overviewRulerLane: vscode.OverviewRulerLane.Center,
})
const redType = vscode.window.createTextEditorDecorationType({
	backgroundColor: 'maroon',
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	overviewRulerColor: 'maroon',
	overviewRulerLane: vscode.OverviewRulerLane.Center,
})
const yellowType = vscode.window.createTextEditorDecorationType({
	// backgroundColor: '#666600',
	border: "solid 0.5px orange",
	// overviewRulerColor: '#666600',
	overviewRulerColor: 'orange',
	overviewRulerLane: vscode.OverviewRulerLane.Left,
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
})
const blueType = vscode.window.createTextEditorDecorationType({
	backgroundColor: 'blue',
	overviewRulerColor: 'blue',
	overviewRulerLane: vscode.OverviewRulerLane.Right,
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
})


// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
