"""Windows process memory for explicitly selected, isolated browser PIDs."""
import ctypes,json,sys,os
from ctypes import wintypes
if os.name!='nt':print('{}');raise SystemExit()
class Counters(ctypes.Structure):
 _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD),('PeakWorkingSetSize',ctypes.c_size_t),('WorkingSetSize',ctypes.c_size_t),('QuotaPeakPagedPoolUsage',ctypes.c_size_t),('QuotaPagedPoolUsage',ctypes.c_size_t),('QuotaPeakNonPagedPoolUsage',ctypes.c_size_t),('QuotaNonPagedPoolUsage',ctypes.c_size_t),('PagefileUsage',ctypes.c_size_t),('PeakPagefileUsage',ctypes.c_size_t)]
k=ctypes.WinDLL('kernel32',use_last_error=True);p=ctypes.WinDLL('psapi',use_last_error=True);k.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];k.OpenProcess.restype=wintypes.HANDLE;k.CloseHandle.argtypes=[wintypes.HANDLE];p.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
result={}
for pid in map(int,sys.argv[1].split(',')):
 handle=k.OpenProcess(0x1010,False,pid)
 if not handle:continue
 c=Counters();c.cb=ctypes.sizeof(c)
 if p.GetProcessMemoryInfo(handle,ctypes.byref(c),c.cb):result[pid]={'working_set':c.WorkingSetSize,'peak_working_set':c.PeakWorkingSetSize,'private_commit':c.PagefileUsage}
 k.CloseHandle(handle)
print(json.dumps(result))
