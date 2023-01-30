const { Stack, Duration, CfnParameter, Fn } = require('aws-cdk-lib');
const eks = require('aws-cdk-lib/aws-eks');
const ec2 = require('aws-cdk-lib/aws-ec2');

class EksTestStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const eksVpc = new ec2.Vpc(this, 'eks-vpc', {
      maxAzs: 2,
    });
    const cluster = new eks.Cluster(this, 'stack-cluster', {
      version: eks.KubernetesVersion.V1_21,
      defaultCapacity: 0, // let nodegroup start instances for more control
      albController: {
        version: eks.AlbControllerVersion.V2_4_1,
      },
      subnets: {
        onePerAz: false,
      },
      vpcSubnets: [{
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }],
    });
    new eks.KubernetesPatch(this, 'enable-prefix-delegation', {
      cluster,
      resourceName: 'daemonset/aws-node',
      resourceNamespace: 'kube-system',
      applyPatch: {
        "spec": {
          "template": {
            "spec": {
              "containers": [
                {
                  "name": "aws-node",
                  "env": [
                    {
                      "name": "ENABLE_PREFIX_DELEGATION",
                      "value": "true"
                    }
                  ]
                }
              ]
            }
          }
        }
      },
      restorePatch: {
        "spec": {
          "template": {
            "spec": {
              "containers": [
                {
                  "name": "aws-node",
                  "env": [
                    {
                      "name": "ENABLE_PREFIX_DELEGATION",
                      "value": "false"
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    });
    const lt = new ec2.CfnLaunchTemplate(this, 'LaunchTemplate', {
      launchTemplateData: {
        userData: Fn.base64(`MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="==MYBOUNDARY=="

--==MYBOUNDARY==
Content-Type: text/x-shellscript; charset="us-ascii"

#!/bin/bash
# test
/etc/eks/bootstrap.sh ${cluster.clusterName} --use-max-pods false --kubelet-extra-args '--max-pods=110' > /var/log/eksbootstrap1

--==MYBOUNDARY==--\\
        `),
      },
    });
    cluster.defaultNodeGroup = new eks.Nodegroup(this, 'nodes', {
      cluster,
      desiredSize: 1,
      maxSize: 1,
      subnets: {
        onePerAz: false,
      },
      bootstrapOptions: {
        useMaxPods: false,
        kubeletExtraArgs: '--max-pods=110',
      },
      launchTemplateSpec: {
        id: lt.ref,
        version: lt.attrLatestVersionNumber,
      },
      vpc: eksVpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });
  }
}

module.exports = { EksTestStack }
