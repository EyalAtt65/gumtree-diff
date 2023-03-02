// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const process = require("process");
const { execSync } = require("child_process");


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

function cmd(command) {
	const current_path = process.env.PATH;
	const new_path = current_path.concat(";", "c:\\Program Files\\Java\\jdk-17\\bin")
	process.env["PATH"] = new_path
	return execSync(command) .toString()
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "gumtree-diff" is now active!')

	let source_uri = null

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	vscode.commands.registerCommand('gumtree-diff.source_select', function (uri) {
		// vscode.window.showInformationMessage(`source file selected: ${uri.fsPath}`)
		source_uri = uri
	});

	vscode.commands.registerCommand('gumtree-diff.dest_select', function (dest_uri) {
		// vscode.window.showInformationMessage(`destination file selected: ${dest_uri.fsPath}`)
		if (source_uri == null) {
			vscode.window.showInformationMessage("[ERROR] no source file selected")
		}
		// vscode.window.showInformationMessage(`comparing files: source-${source_uri.fsPath}, dest-${dest_uri.fsPath}`)
		// let newtab = new vscode.TabInputTextDiff(source_uri,dest_uri)		
		// vscode.workspace.openTextDocument(newtab)
		// vscode.window.showTextDocument(newtab.modified)
		// let newtab = new vscode.TabInputTextDiff(source_uri, source_uri)
		// let newtab2 = new vscode.TabInputTextDiff(dest_uri, dest_uri)
		// vscode.window.showTextDocument(newtab.modified)
		// vscode.window.showTextDocument(newtab2.modified, {viewColumn: vscode.ViewColumn.Beside})

		let out = cmd(`java.exe -cp \"${__dirname}\\gumtree_reduced\\client\\build\\classes\\java\\main;${__dirname}\\gumtree_reduced\\core\\build\\classes\\java\\main;${__dirname}\\gumtree_reduced\\gen.python\\build\\classes\\java\\main;${__dirname}\\gumtree_reduced\\external_jars\\*\" com.github.gumtreediff.client.Run`)
		vscode.window.showInformationMessage('fuck this \"' + out + '\" shit')

		vscode.workspace.openTextDocument(source_uri).then(src_doc => {
			vscode.window.showTextDocument(src_doc).then(src_editor => {
				vscode.workspace.openTextDocument(dest_uri).then(dest_doc => {
					vscode.window.showTextDocument(dest_doc, {viewColumn: vscode.ViewColumn.Beside}).then(dest_editor => {
							decorate(src_editor, dest_editor)
					})
				})
			})
		})
	});
}

function decorate(editor0, editor1) {
	let sourceCode = editor0.document.getText()

	let greenArray = []
	let range1 = new vscode.Range(new vscode.Position(0, 3),
								 new vscode.Position(3, 10))
	let greenDecoration = {range: range1}
	greenArray.push(greenDecoration)
	editor0.setDecorations(greenType, greenArray)

	let redArray = []
	let range2 = new vscode.Range(new vscode.Position(7, 2),
								  new vscode.Position(7, 6))
	let redDecoration = {range: range2}
	redArray.push(redDecoration)
	editor0.setDecorations(redType, redArray)

	let yellowArray = []
	let range3 = new vscode.Range(new vscode.Position(0, 6),
								 new vscode.Position(0, 30))
	let yellowDecoration = {range: range3}
	yellowArray.push(yellowDecoration)
	editor1.setDecorations(yellowType, yellowArray)

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
