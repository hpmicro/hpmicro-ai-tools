// Reports invocation details for opt-in reference comparisons without running SDK tools.
package main

import (
 "encoding/json"
 "fmt"
 "os"
)

func main() {
 if len(os.Args)>1 && os.Args[1]=="--version" {fmt.Println("fake-tool 1.0");return}
 cwd,_:=os.Getwd()
 json.NewEncoder(os.Stdout).Encode(map[string]any{"args":os.Args[1:],"cwd":cwd,"sdk":os.Getenv("HPM_SDK_BASE"),"toolchain":os.Getenv("GNURISCV_TOOLCHAIN_PATH")})
 if os.Getenv("HPMSDKCTL_FAKE_EXIT")=="7" {fmt.Fprint(os.Stderr,"fake failure");os.Exit(7)}
}
