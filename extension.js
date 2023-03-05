const vscode = require('vscode');
const process = require("process");
const { execSync } = require("child_process");

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
			vscode.window.showInformationMessage("[ERROR] no source file selected")
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
			vscode.workspace.openTextDocument(dest_uri).then(dest_doc => {
				vscode.window.showTextDocument(dest_doc, {viewColumn: vscode.ViewColumn.Beside}).then(dest_editor => {
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
	let command = `java.exe -cp ${classpath} com.github.gumtreediff.client.Run ${source_uri.fsPath} ${dest_uri.fsPath}`
	
	let json_str = ""
	try {
		json_str = execSync(command).toString()
	} catch (error) {
		handle_backend_error(error.status, source_uri, dest_uri)
	}
	
	return json_str

}

/**
 * @param {number} error_code 
 * @param {vscode.Uri} source_uri 
 * @param {vscode.Uri} dest_uri 
 */
function handle_backend_error(error_code, source_uri, dest_uri) {
	if (error_code == BACKEND_ERRORCODES.INVALID_PATH_SRC) {
		vscode.window.showInformationMessage(`[ERROR] source file ${source_uri.fsPath} does not exist`)
	} else if (error_code == BACKEND_ERRORCODES.INVALID_PATH_DST) {
		vscode.window.showInformationMessage(`[ERROR] dest file ${dest_uri.fsPath} does not exist`)
	} else if (error_code == BACKEND_ERRORCODES.SYNTAX_ERROR_SRC) {
		vscode.window.showInformationMessage(`[ERROR] source file ${source_uri.fsPath} is not a valid python file`)
	} else if (error_code == BACKEND_ERRORCODES.SYNTAX_ERROR_DST) {
		vscode.window.showInformationMessage(`[ERROR] dest file ${dest_uri.fsPath} is not a valid python file`)
	}
}

/**
 * @param {{matches:{src: String, dest: String}[],
 *  actions:Array.<{action: String, tree: String, parent: String, at: Number}|
 * {action: String, tree: String, label: String}|
 * {action: String, tree: String}>}} json
 * @param {vscode.TextEditor} src_editor 
 * @param {vscode.TextEditor} dst_editor 
 * @returns 
 */
function get_actions_and_ranges(json, src_editor, dst_editor) {
	let actions_and_ranges = []
	for (var i = 0; i < json.actions.length; i++) {
		var obj = json.actions[i]
		const range_re = /.*\[(\d\d?),(\d\d?)\]/
		let matches = obj["tree"].match(range_re)
		let range_base = matches[1]
		let range_end = matches[2]
		let range
		// TODO: add more actions
		if (obj["action"] === "delete-tree" || obj["action"] === "delete-node") {
			range = offset_to_range(Number(range_base), Number(range_end), src_editor)
		}
		actions_and_ranges.push({action: obj["action"], range: range})
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
		} else if (i == range_end) {
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
 * @param {{action: String, range: vscode.Range}[]} actions_and_ranges 
 * @param {vscode.TextEditor} src_editor 
 * @param {vscode.TextEditor} dst_editor 
 */
function decorate_actions(actions_and_ranges, src_editor, dst_editor) {
	let redArray = []
	for (let i = 0; i < actions_and_ranges.length; i++) {
		// TODO: add more actions
		if (actions_and_ranges[i]["action"] === "delete-tree" || actions_and_ranges[i]["action"] === "delete-node") {
			redArray.push(actions_and_ranges[i]["range"])
		}
	}
	src_editor.setDecorations(redType, redArray)
}

const greenType = vscode.window.createTextEditorDecorationType({
	backgroundColor: 'green',
	// border: '2px solid white',
	})
const redType = vscode.window.createTextEditorDecorationType({
	backgroundColor: 'red',
	// border: '2px solid white',
	})
const yellowType = vscode.window.createTextEditorDecorationType({
	backgroundColor: '#f29500cc',
	// border: '2px solid white',
	})



// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
