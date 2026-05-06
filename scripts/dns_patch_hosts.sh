#!/bin/sh
set -eu

marker_begin="# project-lex local dns begin"
marker_end="# project-lex local dns end"

entries=$(awk '
    /hosts[[:space:]]*\{/ { found=1; next }
    found && /\}/          { found=0; next }
    found && NF==2         { print "127.0.0.1 " $2 }
' /Corefile)

# Strip existing block, then append updated block — output goes to stdout
awk -v begin="$marker_begin" -v end="$marker_end" '
    $0 == begin {skip=1; next}
    $0 == end   {skip=0; next}
    !skip       {print}
' /host/hosts

printf "%s\n%s\n%s\n" "$marker_begin" "$entries" "$marker_end"
