#!/bin/bash
set -euo pipefail

case "$(uname -s)" in
	Darwin)
		echo "/etc/hosts"
		;;
	Linux)
		if grep -qi microsoft /proc/version 2>/dev/null; then
			echo "/mnt/c/Windows/System32/drivers/etc/hosts"
		else
			echo "/etc/hosts"
		fi
		;;
	MINGW*|MSYS*|CYGWIN*)
		echo "/c/Windows/System32/drivers/etc/hosts"
		;;
	*)
		echo "Unsupported operating system: $(uname -s)" >&2
		exit 1
		;;
esac
