import paramiko
import sys

host = 'zboarasageata.local'
user = 'kenny'
password = 'kali'
command = sys.argv[1]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(host, username=user, password=password)
    stdin, stdout, stderr = client.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print("STDERR:", err)
    sys.exit(exit_status)
finally:
    client.close()
