import os
import sys
try:
    import glances
except Exception as e:
    print("Glances is not installed in this environment:", e)
    sys.exit(1)


def main():
    argv = ['glances', '-w']
    # Bind/port
    bind = os.environ.get('GLANCES_BIND', '127.0.0.1')
    argv += ['--bind', bind]
    port = os.environ.get('GLANCES_PORT')
    if port:
        argv += ['--port', str(port)]
    # Refresh rate (seconds)
    refresh = os.environ.get('GLANCES_REFRESH')
    if refresh:
        argv += ['-t', str(refresh)]
    # Disable plugins (comma-separated)
    disable = os.environ.get('GLANCES_DISABLE_PLUGINS')
    if disable:
        argv += ['--disable-plugin', disable]
    sys.argv = argv
    return glances.main()


if __name__ == '__main__':
    sys.exit(main())
