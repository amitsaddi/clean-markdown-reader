import * as vscode from 'vscode';
import * as path from 'path';

export class TasksViewProvider implements vscode.TreeDataProvider<TaskItem> {
  // The vscode.TreeDataProvider interface requires `void` in the union; the lint
  // rule disallows void in unions, so we suppress it on these two declarations only.
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  private readonly _onDidChangeTreeData: vscode.EventEmitter<TaskItem | undefined | null | void> = new vscode.EventEmitter<TaskItem | undefined | null | void>();
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  readonly onDidChangeTreeData: vscode.Event<TaskItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private tasks: TaskItem[] = [];
  private static readonly TASK_REGEX = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)/;

  constructor(private readonly workspaceRoot: string | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TaskItem): Promise<TaskItem[]> {
    if (this.workspaceRoot === undefined || this.workspaceRoot === '') {
      return [];
    }

    if (element !== undefined) {
      return [];
    }

    await this.scanForTasks();
    return this.tasks;
  }

  private async scanForTasks(): Promise<void> {
    this.tasks = [];
    if (this.workspaceRoot === undefined || this.workspaceRoot === '') {
      return;
    }

    const mdFiles = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');

    for (const file of mdFiles) {
      try {
        const content = await vscode.workspace.fs.readFile(file);
        const text = Buffer.from(content).toString('utf8');
        const lines = text.split('\n');

        lines.forEach((line, index) => {
          const match = TasksViewProvider.TASK_REGEX.exec(line);
          if (match?.[1] !== undefined && match[2] !== undefined) {
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
      } catch {
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
    
    this.tooltip = label;
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
