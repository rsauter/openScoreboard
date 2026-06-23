#!/bin/bash

# Configuration
# OUTPUT_FILE can be overridden via the FOLDER_MD_OUTPUT env var (used by
# collect-for-claude.sh to point this directly at claude_upload/folder.md).
# Falls back to ./folder.md when run standalone.
OUTPUT_FILE="${FOLDER_MD_OUTPUT:-folder.md}"
# Define ignore patterns as an array
IGNORE_PATTERNS=("node_modules" ".git" "generated" ".env" "package-lock.json" "yarn.lock" "folder.md" ".DS_Store" "claude_upload" "dev-tools")

# Function to check if a file/folder should be ignored
should_ignore() {
    local name="$1"
    for pattern in "${IGNORE_PATTERNS[@]}"; do
        if [[ "$name" == "$pattern" ]]; then
            return 0 # True (ignore)
        fi
    done
    return 1 # False (keep)
}

# Recursive function to walk directories
# Arguments: $1 = directory path, $2 = indentation prefix
walk_dir() {
    local dir="$1"
    local prefix="$2"

    # Read directory contents
    # We use a simple loop over globbing to avoid complex find/sort issues on mac/linux
    shopt -s nullglob dotglob # Include hidden files, handle empty dirs
    
    local entries=("$dir"/*)
    shopt -u nullglob dotglob

    # Separate folders and files for sorting (Folders first)
    local folders=()
    local files=()

    for entry in "${entries[@]}"; do
        local name
        name=$(basename "$entry")
        
        # Check ignore list
        if should_ignore "$name"; then
            continue
        fi

        if [ -d "$entry" ]; then
            folders+=("$entry")
        else
            files+=("$entry")
        fi
    done

    # Sort arrays
    local sorted_folders sorted_files
    IFS=$'\n' sorted_folders=($(sort <<<"${folders[*]}")); unset IFS
    IFS=$'\n' sorted_files=($(sort <<<"${files[*]}")); unset IFS

    # Process Folders first
    for entry in "${sorted_folders[@]}"; do
        local name
        name=$(basename "$entry")
        echo "${prefix}- **${name}/**" >> "$OUTPUT_FILE"
        walk_dir "$entry" "${prefix}  "
    done

    # Process Files
    for entry in "${sorted_files[@]}"; do
        local name
        name=$(basename "$entry")
        echo "${prefix}- **${name}**" >> "$OUTPUT_FILE"
    done
}

# Main Execution
main() {
    local project_name
    project_name=$(basename "$(pwd)")
    local current_date
    current_date=$(date +"%Y-%m-%d %H:%M:%S")

    echo "🔍 Scanning project structure..."

    # Clear or create output file with header
    cat > "$OUTPUT_FILE" <<EOF
# Project Structure: ${project_name}

Generated on: ${current_date}

## File Tree

EOF

    # Start walking from current directory
    walk_dir "." ""

    echo "✅ Successfully created: ${OUTPUT_FILE}"
    echo "📄 The file contains an overview of all relevant project files."
}

# Run main
main