import storageclient
import os

script_dir = os.path.dirname(os.path.realpath(__file__))

client = storageclient.CLIENT
# recordId = ''
file_path = os.path.abspath(os.path.join(script_dir, '../files/upload.txt'))
file_record = client.write_file('test-file', file_path)
print(file_record.record_id)
