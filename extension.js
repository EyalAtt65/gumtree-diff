const vscode = require('vscode');
const process = require("process");
const { execSync } = require("child_process");
const { off, cpuUsage } = require('process');
const { reduceEachLeadingCommentRange } = require('typescript');

const JDK_DIR = "c:\\Program Files\\Java\\jdk-17\\bin"
const BACKEND_ERRORCODES = {
	SUCCESS: 0,
	SYNTAX_ERROR_SRC: 1,
	SYNTAX_ERROR_DST: 2,
	INVALID_PATH_SRC: 3,
	INVALID_PATH_DST: 4
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "gumtree-diff" is now active!')

	let source_uri = null
	let dest_uri = null

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	vscode.commands.registerCommand('gumtree-diff.source_select', function (uri) {
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
}

/**
 * @param {vscode.Uri} source_uri 
 * @param {vscode.Uri} dest_uri 
 */
function handle_diff(source_uri, dest_uri) {
	let json_str = execute_backend(source_uri, dest_uri)
	if (!json_str) {
		source_uri = null
		vscode.commands.executeCommand('setContext', 'gumtree-diff.source_selected', false);
		return
	}
	let out_json = JSON.parse(json_str)

	vscode.workspace.openTextDocument(source_uri).then(src_doc => {
		vscode.window.showTextDocument(src_doc).then(src_editor => {
			// TODO: maybe delete
			src_editor.edit(builder => {builder.setEndOfLine(vscode.EndOfLine.LF)})
			vscode.workspace.openTextDocument(dest_uri).then(dest_doc => {
				vscode.window.showTextDocument(dest_doc, {viewColumn: vscode.ViewColumn.Beside}).then(dest_editor => {
					// TODO: maybe delete
					dest_editor.edit(builder => {builder.setEndOfLine(vscode.EndOfLine.LF)})
					let actions_and_ranges = get_actions_and_ranges(out_json, src_editor, dest_editor)
					decorate_actions(actions_and_ranges, src_editor, dest_editor)
				})
			})
		})
	})

	source_uri = null
	vscode.commands.executeCommand('setContext', 'gumtree-diff.source_selected', false);
}

/**
 * @param {vscode.Uri} source_uri 
 * @param {vscode.Uri} dest_uri 
 * @returns
 */
function execute_backend(source_uri, dest_uri) {
	const current_path = process.env.PATH;
	const new_path = current_path.concat(";", JDK_DIR)
	process.env["PATH"] = new_path

	let classpath = `\"${__dirname}\\gumtree_reduced\\client\\build\\classes\\java\\main;`
	classpath = classpath.concat(`${__dirname}\\gumtree_reduced\\core\\build\\classes\\java\\main;`)
	classpath = classpath.concat(`${__dirname}\\gumtree_reduced\\gen.python\\build\\classes\\java\\main;`)
	classpath = classpath.concat(`${__dirname}\\gumtree_reduced\\external_jars\\*\"`)
	let command = `java.exe -cp ${classpath} com.github.gumtreediff.client.Run "${source_uri.fsPath}" "${dest_uri.fsPath}"`
	
	let json_str = ""
	try {
		json_str = execSync(command).toString()
	} catch (error) {
		handle_backend_error(error.status, source_uri, dest_uri)
	}
	
	return json_str

}

/**
 * @param {Number} error_code 
 * @param {vscode.Uri} source_uri 
 * @param {vscode.Uri} dest_uri 
 */
function handle_backend_error(error_code, source_uri, dest_uri) {
	if (error_code == BACKEND_ERRORCODES.INVALID_PATH_SRC) {
		vscode.window.showErrorMessage(`source file ${source_uri.fsPath} does not exist`)
	} else if (error_code == BACKEND_ERRORCODES.INVALID_PATH_DST) {
		vscode.window.showErrorMessage(`dest file ${dest_uri.fsPath} does not exist`)
	} else if (error_code == BACKEND_ERRORCODES.SYNTAX_ERROR_SRC) {
		vscode.window.showErrorMessage(`source file ${source_uri.fsPath} is not a valid python file`)
	} else if (error_code == BACKEND_ERRORCODES.SYNTAX_ERROR_DST) {
		vscode.window.showErrorMessage(`dest file ${dest_uri.fsPath} is not a valid python file`)
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
 * @returns {Array.<{action: string, range: vscode.Range}|{action: string, ranges:vscode.Range[]}>}
 */
function get_actions_and_ranges(json, src_editor, dst_editor) {
	let actions_and_ranges = []
	for (var i = 0; i < json.actions.length; i++) {
		var action = json.actions[i]
		let src_json_offsets, dst_json_offsets, range1, range2
		// TODO: add more actions
		if (["delete-tree", "delete-node"].includes(action["action"])) {
			src_json_offsets = match_range_from_json_action(action, "tree")
			range1 = offset_to_range(src_json_offsets[0], src_json_offsets[1], src_editor)
			actions_and_ranges.push({action: action["action"], range: range1})
		} else if (["insert-tree", "insert-node"].includes(action["action"])) {
			dst_json_offsets = match_range_from_json_action(action, "tree")
			range1 = offset_to_range(dst_json_offsets[0], dst_json_offsets[1], dst_editor)
			actions_and_ranges.push({action: action["action"], range: range1})
		} else if (["move-tree", "update-node"].includes(action["action"])) {
			src_json_offsets = match_range_from_json_action(action, "tree")
			dst_json_offsets = match_range_from_json_action(action, "to")
			range1 = offset_to_range(src_json_offsets[0], src_json_offsets[1], src_editor)
			range2 = offset_to_range(dst_json_offsets[0], dst_json_offsets[1], dst_editor)
			actions_and_ranges.push({action: action["action"], ranges: [range1, range2]})
		} else {
			console.log("UNKNOWN ACTION")
			console.log(action)
			continue
		}
		
	}

	return actions_and_ranges
}

/**
 * @param {Number} range_base 
 * @param {Number} range_end 
 * @param {vscode.TextEditor} editor 
 * @returns 
 */
function offset_to_range(range_base, range_end, editor) {
	const data = editor.document.getText()

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
			current_line_offset_in_file = i + 1 // if current char is newline, then the next line starts on next char
		}
	}

	return new vscode.Range(new vscode.Position(source_line, source_offset_in_line), 
							new vscode.Position(dest_line, dest_offset_in_line))
}

/**
 * 
 * @param {vscode.Range[]} arr1 
 * @param {vscode.Range[]} arr2 
 * @returns {vscode.Range[]}
 */
function handle_overlapping_ranges(arr1, arr2) {
	let arr_out = []
	while (arr1.length > 0) {
		let curr_range = arr1.pop()
		let should_copy_element = true
		for (let j = 0; j < arr2.length; j++) {
			if (curr_range.start.isAfterOrEqual(arr2[j].end) || curr_range.end.isBeforeOrEqual(arr2[j].start)) {
				continue
			} else if (curr_range.start.isAfterOrEqual(arr2[j].start) && curr_range.end.isBeforeOrEqual(arr2[j].end)) {
				should_copy_element = false
				break
			} else if (curr_range.start.isAfterOrEqual(arr2[j].start) && curr_range.end.isAfter(arr2[j].end)) {
				should_copy_element = false
				arr1.push(new vscode.Range(arr2[j].end.line, arr2[j].end.character, curr_range.end.line, curr_range.end.character))
				break
			} else if (curr_range.start.isBefore(arr2[j].start) && curr_range.end.isBeforeOrEqual(arr2[j].end)) {
				should_copy_element = false
				arr1.push(new vscode.Range(curr_range.start.line, curr_range.start.character, arr2[j].start.line, arr2[j].start.character))
				break
			} else if (curr_range.start.isBefore(arr2[j].start) && curr_range.end.isAfter(arr2[j].end)) {
				should_copy_element = false
				arr1.push(new vscode.Range(curr_range.start.line, curr_range.start.character, arr2[j].start.line, arr2[j].start.character ))
				arr1.push(new vscode.Range(arr2[j].end.line, arr2[j].end.character, curr_range.end.line, curr_range.end.character))
				break
			}
		}

		if (should_copy_element) {
			arr_out.push(curr_range)
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
 * @param {Array.<{action: String, range: vscode.Range}|{action: string, ranges: vscode.Range[]}>} actions_and_ranges 
 * @param {vscode.TextEditor} src_editor 
 * @param {vscode.TextEditor} dst_editor 
 */
function decorate_actions(actions_and_ranges, src_editor, dst_editor) {
	let redArray = []
	let greenArray = []
	let srcYellowArray = []
	let srcBlueArray = []
	let dstYellowArray = []
	let dstBlueArray = []
	for (let i = 0; i < actions_and_ranges.length; i++) {
		// TODO: add more actions
		switch (actions_and_ranges[i]["action"]) {
			case "delete-tree":
			case "delete-node":
				redArray.push(actions_and_ranges[i]["range"])
				break
			case "insert-tree":
			case "insert-node":
				greenArray.push(actions_and_ranges[i]["range"])
				break
			case "move-tree":
				srcBlueArray.push(actions_and_ranges[i]["ranges"][0])
				dstBlueArray.push(actions_and_ranges[i]["ranges"][1])
				break
			case "update-node":
				srcYellowArray.push(actions_and_ranges[i]["ranges"][0])
				dstYellowArray.push(actions_and_ranges[i]["ranges"][1])
				break
		}
	}

	srcBlueArray = remove_redundant_ranges(srcBlueArray)
	srcYellowArray = remove_redundant_ranges(srcYellowArray)
	redArray = remove_redundant_ranges(redArray)

	dstBlueArray = remove_redundant_ranges(dstBlueArray)
	dstYellowArray = remove_redundant_ranges(dstYellowArray)
	greenArray = remove_redundant_ranges(greenArray)
	
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
	// isWholeLine: true,
	})
const redType = vscode.window.createTextEditorDecorationType({
	backgroundColor: 'maroon',
	// isWholeLine: true,
	})
const yellowType = vscode.window.createTextEditorDecorationType({
	backgroundColor: '#666600',
	})
const blueType = vscode.window.createTextEditorDecorationType({
	backgroundColor: 'blue',
	})


// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
