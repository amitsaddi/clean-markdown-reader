import * as vscode from 'vscode';
import * as path from 'path';

export class TasksViewProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TaskItem | undefined | null | void> = new vscode.EventEmitter<TaskItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TaskItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private tasks: TaskItem[] = [];

  constructor(private workspaceRoot: string | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TaskItem): Promise<TaskItem[]> {
    if (!this.workspaceRoot) {
      return Promise.resolve([]);
    }

    if (element) {
      // no children for now (flat list)
      return Promise.resolve([]);
    } else {
      await this.scanForTasks();
      return Promise.resolve(this.tasks);
    }
  }

  private async scanForTasks() {
    this.tasks = [];
    if (!this.workspaceRoot) return;

    // Use VS Code's findFiles to search for markdown files
    const mdFiles = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');

    for (const file of mdFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(file);
        const text = Buffer.from(content).toString('utf8');
        const lines = text.split('\n');

        lines.forEach((line, index) => {
          // simple match for - [ ] or - [x]
          const match = line.match(/^[\s]*[-*+]\s+\[([ xX])\]\s+(.*)/);
          if (match) {
            const isCompleted = match[1].toLowerCase() === 'x';
            const label = match[2].trim();
            const taskItem = new TaskItem(
              label,
              isCompleted,
              file,
              index,
              vscode.TreeItemCollapsibleState.None
            );
            this.tasks.push(taskItem);
          }
        });
      } catch (err) {
        // ignore errors reading specific files
      }
    }
  }
}

class TaskItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly isCompleted: boolean,
    public readonly fileUri: vscode.Uri,
    public readonly line: number,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    
    // Set tooltip and description
    this.tooltip = `${this.label}`;
    this.description = path.basename(fileUri.fsPath);
    
    // Set icon based on completion status
    this.iconPath = new vscode.ThemeIcon(
      isCompleted ? 'pass' : 'circle-outline',
      new vscode.ThemeColor(isCompleted ? 'testing.iconPassed' : 'foreground')
    );
    
    // Command to open the file when clicked
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [
        fileUri,
        {
          selection: new vscode.Range(line, 0, line, 0)
        }
      ]
    };
  }
}
