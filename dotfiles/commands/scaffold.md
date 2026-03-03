Create a new project from the template structure.

Usage: /scaffold <project-name> <category>
Categories: keiy (personal), dstudio (client), bots (telegram)

Steps:
1. Ask for project name and category if not provided
2. Create directory in ~/Documents/Developer/<category>/<project-name>/
3. Initialize with: git init, package.json, tsconfig.json, .env.example, .gitignore, .claudeignore
4. Create CLAUDE.md from ~/.claude/templates/CLAUDE.md.template
5. Report the created structure
