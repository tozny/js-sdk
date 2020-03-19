import storageclient
import os

script_dir = os.path.dirname(os.path.realpath(__file__))

client = storageclient.CLIENT
recordId = '038462e9-b9be-4417-b8fc-b0ece646132b'
file_path = os.path.abspath(os.path.join(script_dir, '../files/download.txt'))
client.read_file(recordId, file_path)
print('done')
