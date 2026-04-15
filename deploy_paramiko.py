import paramiko
import sys

host = 'zboarasageata.local'
user = 'kenny'
password = 'kali'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    print(f"Connecting to {host}...")
    client.connect(host, username=user, password=password)
    
    sftp = client.open_sftp()
    
    files = [
        ('server/src/routes/matches.js', '/home/kenny/ZboaraSageata/server/src/routes/matches.js'),
        ('server/src/realtime/room.js', '/home/kenny/ZboaraSageata/server/src/realtime/room.js'),
        ('web/v1/src/screens/Match.svelte', '/home/kenny/ZboaraSageata/web/v1/src/screens/Match.svelte')
    ]
    
    for local, remote in files:
        print(f"Uploading {local} to {remote}...")
        sftp.put(local, remote)
    
    sftp.close()
    
    print("Executing rebuild and restart...")
    stdin, stdout, stderr = client.exec_command("cd /home/kenny/ZboaraSageata && npm run build -w web/v1 && sudo systemctl restart dartsleague")
    
    # Wait for the command to finish
    exit_status = stdout.channel.recv_exit_status()
    print("STDOUT:", stdout.read().decode())
    print("STDERR:", stderr.read().decode())
    
    if exit_status == 0:
        print("Success!")
    else:
        print(f"Failed with exit code: {exit_status}")
        
finally:
    client.close()
