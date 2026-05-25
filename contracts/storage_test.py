# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *


class Contract(gl.Contract):
    # One TreeMap to verify storage works — never reassigned in __init__
    data: TreeMap[str, str]

    def __init__(self):
        # Only scalars here
        self.deployer = gl.message.sender_address

    @gl.public.write
    def set_value(self, key: str, value: str):
        self.data[key] = value

    @gl.public.view
    def get_value(self, key: str) -> str:
        if key not in self.data:
            return ""
        return self.data[key]

    @gl.public.view
    def get_deployer(self) -> Address:
        return self.deployer
