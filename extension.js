// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "gumtree-diff" is now active!');

	let source_uri = null;

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('gumtree-diff.source_select', function (uri) {
		vscode.window.showInformationMessage(`source file selected: ${uri.fsPath}`);
		source_uri = uri
	});

	disposable = vscode.commands.registerCommand('gumtree-diff.dest_select', function (dest_uri) {
		vscode.window.showInformationMessage(`destination file selected: ${dest_uri.fsPath}`);
		if (source_uri == null) {
			vscode.window.showInformationMessage("[ERROR] no source file selected")
		}
		vscode.window.showInformationMessage(`comparing files: source-${source_uri.fsPath}, dest-${dest_uri.fsPath}`);
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
